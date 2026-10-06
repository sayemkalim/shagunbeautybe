const config = require("../../config/shiprocket");

// In-memory token cache
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Sanitized logger that avoids printing credentials or tokens
 */
const log = {
  info: (message, meta = {}) => {
    const safeMeta = { ...meta };
    delete safeMeta.password;
    delete safeMeta.token;
    delete safeMeta.authorization;
    console.log(`[Shiprocket] ${message}`, Object.keys(safeMeta).length > 0 ? safeMeta : "");
  },
  error: (message, error, meta = {}) => {
    const safeMeta = { ...meta };
    delete safeMeta.password;
    delete safeMeta.token;
    delete safeMeta.authorization;
    console.error(`[Shiprocket ERROR] ${message}:`, error?.message || error, Object.keys(safeMeta).length > 0 ? safeMeta : "");
  },
};

/**
 * Retrieves valid Shiprocket authentication token.
 * Caches token in-memory and reuses it until expiration (or refetches on 401).
 */
const getShiprocketToken = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedToken && tokenExpiresAt && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  if (!config.email || !config.password) {
    throw new Error("Shiprocket credentials (SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD) are not configured in environment variables");
  }

  const url = `${config.baseUrl}/auth/login`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: config.email,
        password: config.password,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.token) {
      const errMsg = data.message || (data.errors ? JSON.stringify(data.errors) : `HTTP ${response.status}`);
      throw new Error(`Shiprocket login failed: ${errMsg}`);
    }

    cachedToken = data.token;
    // Cache for 24 hours
    tokenExpiresAt = now + 24 * 60 * 60 * 1000;
    log.info("Shiprocket token obtained successfully");
    return cachedToken;
  } catch (err) {
    cachedToken = null;
    tokenExpiresAt = null;
    log.error("Authentication failed", err);
    throw err;
  }
};

/**
 * Generic authorized request wrapper with auto-retry on 401 (token refresh)
 */
const request = async (endpoint, options = {}, isRetry = false) => {
  const token = await getShiprocketToken(isRetry);
  const url = `${config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const fetchOptions = {
    ...options,
    headers,
  };

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (networkErr) {
    log.error(`Network request failed for ${endpoint}`, networkErr);
    throw new Error(`Shiprocket network error: ${networkErr.message}`);
  }

  // If unauthorized and not retried yet, clear token and retry once
  if (response.status === 401 && !isRetry) {
    log.info("Shiprocket token expired (401 received). Refreshing token and retrying request...");
    return request(endpoint, options, true);
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    if (!response.ok) {
      throw new Error(`Shiprocket request failed with status ${response.status}`);
    }
    throw new Error(`Failed to parse Shiprocket response for ${endpoint}`);
  }

  if (!response.ok) {
    const errorMsg =
      data.message ||
      (data.errors ? (typeof data.errors === "string" ? data.errors : JSON.stringify(data.errors)) : null) ||
      `Shiprocket API responded with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.shiprocketData = data;
    throw err;
  }

  return data;
};

/**
 * Helper to split full name into first and last name
 */
const splitFullName = (fullName = "") => {
  const parts = String(fullName || "").trim().split(/\s+/);
  const firstName = parts[0] || "Customer";
  const lastName = parts.slice(1).join(" ") || "Customer";
  return { firstName, lastName };
};

/**
 * Helper to sanitize phone numbers into 10 digits
 */
const sanitizePhone = (phone = "") => {
  let cleaned = String(phone || "").replace(/[^0-9]/g, "");
  if (cleaned.length > 10 && cleaned.startsWith("91")) {
    cleaned = cleaned.slice(2);
  }
  return cleaned.slice(-10) || "9999999999";
};

/**
 * Format date into "YYYY-MM-DD HH:mm" for Shiprocket
 */
const formatOrderDate = (date) => {
  const d = date ? new Date(date) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

/**
 * Prepare Shiprocket order creation payload from existing Order document
 */
const buildShiprocketOrderPayload = (order, customPickupLocation = null) => {
  const address = order.address || {};
  const customerName = address.name || (order.isGuestOrder ? order.guestInfo?.name : "Customer") || "Customer";
  const { firstName, lastName } = splitFullName(customerName);
  const phone = sanitizePhone(address.mobile || (order.isGuestOrder ? order.guestInfo?.mobile : null));
  const email = (order.isGuestOrder ? order.guestInfo?.email : null) || "support@shagunbeauty.com";

  // Build items list
  let totalWeightKg = 0;
  const orderItems = (order.items || []).map((item, index) => {
    let name = "Product Item";
    let sku = item.variant_sku || `SKU-${order._id}-${index + 1}`;
    let sellingPrice = 0;
    let units = item.quantity || 1;
    let itemWeightKg = 0;

    if (item.type === "product" && item.product) {
      name = item.product.name || "Product Item";
      const productPrice = item.discounted_total_amount
        ? parseFloat(item.discounted_total_amount.toString()) / units
        : (item.product.discounted_price ? parseFloat(item.product.discounted_price.toString()) : (item.product.price ? parseFloat(item.product.price.toString()) : 0));
      sellingPrice = Math.round(productPrice * 100) / 100;

      const grams = item.product.weight_in_grams || 0;
      itemWeightKg = (grams > 0 ? grams / 1000 : config.defaultDimensions.weight) * units;
    } else if (item.type === "bundle" && item.bundle) {
      name = item.bundle.name || "Bundle Item";
      const bundlePrice = item.discounted_total_amount
        ? parseFloat(item.discounted_total_amount.toString()) / units
        : (item.bundle.discounted_price ? parseFloat(item.bundle.discounted_price.toString()) : (item.bundle.price ? parseFloat(item.bundle.price.toString()) : 0));
      sellingPrice = Math.round(bundlePrice * 100) / 100;
      itemWeightKg = config.defaultDimensions.weight * units;
    }

    totalWeightKg += itemWeightKg;

    return {
      name: name.slice(0, 250),
      sku: sku.slice(0, 100),
      units,
      selling_price: sellingPrice,
      discount: 0,
      tax: 0,
    };
  });

  const finalTotal = parseFloat(order.finalTotalAmount ? order.finalTotalAmount.toString() : "0");
  const subTotal = parseFloat(order.discountedTotalAmount ? order.discountedTotalAmount.toString() : finalTotal.toString());
  const shippingCharges = parseFloat(order.shippingCost ? order.shippingCost.toString() : "0");
  const totalDiscount = parseFloat(order.couponDiscountAmount ? order.couponDiscountAmount.toString() : "0");

  const paymentMethod = order.paymentMode === "COD" ? "COD" : "Prepaid";

  // Use orderNumber or fallback to _id
  const orderDisplayId = order.orderNumber
    ? `OD-${String(order.orderNumber).replace(/^OD-|^#/, "")}`
    : `ORD-${order._id}`;

  const weightInKg = Math.max(0.1, Math.round((totalWeightKg || config.defaultDimensions.weight) * 100) / 100);

  const payload = {
    order_id: orderDisplayId,
    order_date: formatOrderDate(order.createdAt),
    pickup_location: customPickupLocation || config.pickupLocation,
    channel_id: "",
    comment: "Order from Shagun Beauty",
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: address.address || "Address",
    billing_address_2: [address.locality, address.landmark].filter(Boolean).join(", ") || "",
    billing_city: address.city || "City",
    billing_pincode: String(address.pincode || "").trim(),
    billing_state: address.state || "State",
    billing_country: "India",
    billing_email: email,
    billing_phone: phone,
    shipping_is_billing: true,
    shipping_customer_name: firstName,
    shipping_last_name: lastName,
    shipping_address: address.address || "Address",
    shipping_address_2: [address.locality, address.landmark].filter(Boolean).join(", ") || "",
    shipping_city: address.city || "City",
    shipping_pincode: String(address.pincode || "").trim(),
    shipping_state: address.state || "State",
    shipping_country: "India",
    shipping_email: email,
    shipping_phone: phone,
    order_items: orderItems,
    payment_method: paymentMethod,
    shipping_charges: shippingCharges,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: totalDiscount,
    sub_total: subTotal,
    length: config.defaultDimensions.length,
    breadth: config.defaultDimensions.breadth,
    height: config.defaultDimensions.height,
    weight: weightInKg,
  };

  return payload;
};

/**
 * 1. Create order in Shiprocket (/orders/create/adhoc)
 */
const createOrder = async (order, customPickupLocation = null) => {
  const payload = buildShiprocketOrderPayload(order, customPickupLocation);
  log.info("Creating Shiprocket order", { internalOrderId: order._id, orderDisplayId: payload.order_id });

  const result = await request("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  log.info("Shiprocket order created successfully", {
    internalOrderId: order._id,
    shiprocketOrderId: result.order_id,
    shipmentId: result.shipment_id,
    status: result.status,
  });

  return result;
};

/**
 * 2. Check Courier Serviceability (/courier/serviceability/)
 */
const checkServiceability = async ({ pickupPostcode, deliveryPostcode, weight, cod }) => {
  const params = new URLSearchParams({
    pickup_postcode: pickupPostcode || "",
    delivery_postcode: deliveryPostcode || "",
    weight: String(weight || config.defaultDimensions.weight),
    cod: cod ? "1" : "0",
  });

  log.info("Checking courier serviceability", { pickupPostcode, deliveryPostcode, weight, cod });

  const result = await request(`/courier/serviceability/?${params.toString()}`, {
    method: "GET",
  });

  return result;
};

/**
 * 3. Assign Courier / AWB (/courier/assign/awb)
 */
const assignAwb = async ({ shipmentId, courierId }) => {
  if (!shipmentId) {
    throw new Error("Shipment ID is required to assign AWB");
  }

  const payload = {
    shipment_id: shipmentId,
    ...(courierId ? { courier_id: courierId } : {}),
  };

  log.info("Assigning AWB / Courier", { shipmentId, courierId });

  const result = await request("/courier/assign/awb", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  log.info("AWB assigned successfully", {
    shipmentId,
    awbCode: result?.response?.data?.awb_code || result?.awb_code,
    courierName: result?.response?.data?.courier_name || result?.courier_name,
  });

  return result;
};

/**
 * 4. Generate Pickup (/courier/generate/pickup)
 */
const generatePickup = async ({ shipmentId, pickupDate }) => {
  if (!shipmentId) {
    throw new Error("Shipment ID is required to generate pickup");
  }

  const shipmentIds = Array.isArray(shipmentId) ? shipmentId : [Number(shipmentId) || shipmentId];

  const payload = {
    shipment_id: shipmentIds,
    ...(pickupDate ? { pickup_date: [pickupDate] } : {}),
  };

  log.info("Generating pickup", { shipmentIds });

  const result = await request("/courier/generate/pickup", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  log.info("Pickup generated", { shipmentIds, status: result?.pickup_status || result?.message });
  return result;
};

/**
 * 5. Generate Shipping Label (/courier/generate/label)
 */
const generateLabel = async ({ shipmentId }) => {
  if (!shipmentId) {
    throw new Error("Shipment ID is required to generate label");
  }

  const shipmentIds = Array.isArray(shipmentId) ? shipmentId : [Number(shipmentId) || shipmentId];

  log.info("Generating shipping label", { shipmentIds });

  const result = await request("/courier/generate/label", {
    method: "POST",
    body: JSON.stringify({ shipment_id: shipmentIds }),
  });

  return result;
};

/**
 * 6. Generate Manifest (/manifests/generate)
 */
const generateManifest = async ({ shipmentId }) => {
  if (!shipmentId) {
    throw new Error("Shipment ID is required to generate manifest");
  }

  const shipmentIds = Array.isArray(shipmentId) ? shipmentId : [Number(shipmentId) || shipmentId];

  log.info("Generating manifest", { shipmentIds });

  const result = await request("/manifests/generate", {
    method: "POST",
    body: JSON.stringify({ shipment_id: shipmentIds }),
  });

  return result;
};

/**
 * 7. Print Manifest (/manifests/print)
 */
const printManifest = async ({ orderIds }) => {
  if (!orderIds || (Array.isArray(orderIds) && orderIds.length === 0)) {
    throw new Error("Order ID(s) required to print manifest");
  }

  const ids = Array.isArray(orderIds) ? orderIds : [orderIds];

  const result = await request("/manifests/print", {
    method: "POST",
    body: JSON.stringify({ order_ids: ids }),
  });

  return result;
};

/**
 * 8. Track by AWB Code (/courier/track/awb/{awb_code})
 */
const trackByAwb = async (awbCode) => {
  if (!awbCode) {
    throw new Error("AWB code is required for tracking");
  }

  log.info("Tracking shipment by AWB", { awbCode });

  const result = await request(`/courier/track/awb/${encodeURIComponent(awbCode)}`, {
    method: "GET",
  });

  return result;
};

/**
 * 9. Track by Shipment ID (/courier/track/shipment/{shipment_id})
 */
const trackByShipmentId = async (shipmentId) => {
  if (!shipmentId) {
    throw new Error("Shipment ID is required for tracking");
  }

  log.info("Tracking shipment by Shipment ID", { shipmentId });

  const result = await request(`/courier/track/shipment/${encodeURIComponent(shipmentId)}`, {
    method: "GET",
  });

  return result;
};

/**
 * 10. Cancel Order / Shipment in Shiprocket (/orders/cancel)
 */
const cancelOrder = async ({ shiprocketOrderId, awbCode }) => {
  if (shiprocketOrderId) {
    const ids = Array.isArray(shiprocketOrderId) ? shiprocketOrderId : [shiprocketOrderId];
    log.info("Cancelling Shiprocket order", { shiprocketOrderId: ids });
    const result = await request("/orders/cancel", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    return result;
  }

  if (awbCode) {
    const awbs = Array.isArray(awbCode) ? awbCode : [awbCode];
    log.info("Cancelling Shiprocket AWB shipment", { awbs });
    const result = await request("/orders/cancel/shipment/awbs", {
      method: "POST",
      body: JSON.stringify({ awbs }),
    });
    return result;
  }

  throw new Error("Either shiprocketOrderId or awbCode is required to cancel Shiprocket order");
};

/**
 * Map Shiprocket status strings to our internal order status
 */
const mapShiprocketStatusToInternal = (shiprocketStatus) => {
  if (!shiprocketStatus) return null;
  const s = String(shiprocketStatus).toUpperCase().trim();

  if (s.includes("DELIVERED")) return "delivered";
  if (s.includes("OUT FOR DELIVERY") || s === "OUT_FOR_DELIVERY") return "out_for_delivery";
  if (s.includes("IN TRANSIT") || s.includes("SHIPPED") || s.includes("PICKED UP") || s.includes("REACHED")) return "shipped";
  if (s.includes("RTO") || s.includes("RETURN")) return "returned";
  if (s.includes("CANCELED") || s.includes("CANCELLED")) return "cancelled";
  if (s.includes("READY TO SHIP") || s.includes("MANIFEST") || s.includes("PICKUP GENERATED") || s.includes("PICKUP SCHEDULED")) return "processing";

  return null;
};

module.exports = {
  getShiprocketToken,
  buildShiprocketOrderPayload,
  createOrder,
  checkServiceability,
  assignAwb,
  generatePickup,
  generateLabel,
  generateManifest,
  printManifest,
  trackByAwb,
  trackByShipmentId,
  cancelOrder,
  mapShiprocketStatusToInternal,
};
