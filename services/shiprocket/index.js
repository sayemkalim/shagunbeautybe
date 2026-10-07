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

  if (endpoint.includes("create") || options.method === "POST") {
    let safeDataKeys = [];
    if (options.body) {
      try {
        const parsed = JSON.parse(options.body);
        safeDataKeys = Object.keys(parsed);
      } catch (e) {}
    }
    console.log("SHIPROCKET CREATE REQUEST DEBUG", {
      method: options.method || "GET",
      url,
      baseURL: config.baseUrl,
      hasData: Boolean(options.body),
      dataKeys: safeDataKeys,
    });
  }

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

  if (endpoint.includes("create") || options.method === "POST") {
    console.log("SHIPROCKET CREATE RESPONSE META DEBUG", {
      status: response?.status ?? null,
      statusText: response?.statusText ?? null,
      redirected: response?.redirected ?? false,
      finalUrl: response?.url ?? url,
      responseDataType: typeof data,
      responseDataIsArray: Array.isArray(data),
      responseDataKeys:
        data && typeof data === "object"
          ? Object.keys(data)
          : [],
    });
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
 * Helper to get customer full name from order
 */
const getCustomerName = (order) => {
  const user = order.user && typeof order.user === "object" ? order.user : {};
  const address = order.address || {};
  const guestInfo = order.guestInfo || {};

  const userName = (user.name || user.fullName || "").trim();
  if (userName) return userName;

  const addressName = (address.name || "").trim();
  if (addressName) return addressName;

  const guestName = (guestInfo.name || "").trim();
  if (guestName) return guestName;

  return "Customer";
};

/**
 * Helper to split full name into first and last name.
 * Does NOT append "Customer" to last name if single word name.
 */
const splitFullName = (fullName = "") => {
  const trimmed = String(fullName || "").trim();
  if (!trimmed) {
    return { firstName: "Customer", lastName: "" };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "Customer";
  const lastName = parts.slice(1).join(" ") || "";
  return { firstName, lastName };
};

/**
 * Helper to resolve customer email from order / user
 */
const getCustomerEmail = (order, phone = "") => {
  const user = order.user && typeof order.user === "object" ? order.user : {};
  const guestInfo = order.guestInfo || {};
  const address = order.address || {};

  const userEmail = (user.email || "").trim();
  if (userEmail) return userEmail;

  const guestEmail = (guestInfo.email || "").trim();
  if (guestEmail) return guestEmail;

  const orderEmail = (order.email || address.email || "").trim();
  if (orderEmail) return orderEmail;

  // Fallback if no email is registered (do NOT use support@shagunbeauty.com)
  const cleanPhone = phone || "customer";
  return `${cleanPhone}@shagunbeauty.com`;
};

/**
 * Helper to sanitize phone numbers into 10 digits
 */
const sanitizePhone = (phone = "") => {
  let cleaned = String(phone || "").replace(/[^0-9]/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    cleaned = cleaned.slice(2);
  }
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
const buildShiprocketOrderPayload = (order, options = {}) => {
  let customPickupLocation = null;
  let packageDetails = null;

  if (typeof options === "string") {
    customPickupLocation = options;
  } else if (options && typeof options === "object") {
    customPickupLocation = options.pickupLocation || null;
    packageDetails = options.packageDetails || null;
  }

  const address = order.address || {};
  const customerName = getCustomerName(order);
  const { firstName, lastName } = splitFullName(customerName);

  const rawPhone = address.mobile || (order.user && typeof order.user === "object" ? order.user.phone : null) || (order.isGuestOrder ? order.guestInfo?.mobile : null) || "";
  const phone = sanitizePhone(rawPhone);

  const email = getCustomerEmail(order, phone);

  // Build items list
  const orderItems = (order.items || []).map((item, index) => {
    let name = "Product Item";
    let sku = item.variant_sku || `SKU-${order._id}-${index + 1}`;
    let sellingPrice = 0;
    let units = item.quantity || 1;

    if (item.type === "product" && item.product) {
      name = item.product.name || "Product Item";
      const productPrice = item.discounted_total_amount
        ? parseFloat(item.discounted_total_amount.toString()) / units
        : (item.product.discounted_price ? parseFloat(item.product.discounted_price.toString()) : (item.product.price ? parseFloat(item.product.price.toString()) : 0));
      sellingPrice = Math.round(productPrice * 100) / 100;
    } else if (item.type === "bundle" && item.bundle) {
      name = item.bundle.name || "Bundle Item";
      const bundlePrice = item.discounted_total_amount
        ? parseFloat(item.discounted_total_amount.toString()) / units
        : (item.bundle.discounted_price ? parseFloat(item.bundle.discounted_price.toString()) : (item.bundle.price ? parseFloat(item.bundle.price.toString()) : 0));
      sellingPrice = Math.round(bundlePrice * 100) / 100;
    }

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

  const paymentMethod = String(order.paymentMode || "").toUpperCase() === "COD" ? "COD" : "Prepaid";

  // Use orderNumber or fallback to _id
  const orderDisplayId = order.orderNumber
    ? `OD-${String(order.orderNumber).replace(/^OD-|^#/, "")}`
    : `ORD-${order._id}`;

  const weight = packageDetails?.weight !== undefined && packageDetails?.weight !== null
    ? parseFloat(packageDetails.weight)
    : config.defaultDimensions.weight;
  const length = packageDetails?.length !== undefined && packageDetails?.length !== null
    ? parseFloat(packageDetails.length)
    : config.defaultDimensions.length;
  const breadth = packageDetails?.breadth !== undefined && packageDetails?.breadth !== null
    ? parseFloat(packageDetails.breadth)
    : config.defaultDimensions.breadth;
  const height = packageDetails?.height !== undefined && packageDetails?.height !== null
    ? parseFloat(packageDetails.height)
    : config.defaultDimensions.height;

  const payload = {
    order_id: orderDisplayId,
    order_date: formatOrderDate(order.createdAt),
    pickup_location: customPickupLocation || config.pickupLocation || "Shagun Beauty",
    channel_id: "",
    comment: "Order from Shagun Beauty",
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: address.address || "",
    billing_address_2: [address.locality, address.landmark].filter(Boolean).join(", ") || "",
    billing_city: address.city || "",
    billing_pincode: String(address.pincode || "").trim(),
    billing_state: address.state || "",
    billing_country: "India",
    billing_email: email,
    billing_phone: phone,
    shipping_is_billing: true,
    shipping_customer_name: firstName,
    shipping_last_name: lastName,
    shipping_address: address.address || "",
    shipping_address_2: [address.locality, address.landmark].filter(Boolean).join(", ") || "",
    shipping_city: address.city || "",
    shipping_pincode: String(address.pincode || "").trim(),
    shipping_state: address.state || "",
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
    length,
    breadth,
    height,
    weight,
  };

  return payload;
};

/**
 * 1. Create order in Shiprocket (/orders/create/adhoc)
 */
const createOrder = async (order, options = {}) => {
  let customPickupLocation = null;
  let packageDetails = null;

  if (typeof options === "string") {
    customPickupLocation = options;
  } else if (options && typeof options === "object") {
    customPickupLocation = options.pickupLocation || null;
    packageDetails = options.packageDetails || null;
  }

  const payload = buildShiprocketOrderPayload(order, {
    pickupLocation: customPickupLocation,
    packageDetails,
  });
  log.info("Creating Shiprocket order", { internalOrderId: order._id, orderDisplayId: payload.order_id });

  const result = await request("/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  console.log("SHIPROCKET CREATE DATA TYPE DEBUG", {
    rootType: typeof result,
    dataType: typeof result?.data,
    nestedDataType: typeof result?.data?.data,
    rootIsArray: Array.isArray(result),
    dataIsArray: Array.isArray(result?.data),
    nestedDataIsArray: Array.isArray(result?.data?.data),
    nestedDataLength: Array.isArray(result?.data?.data)
      ? result.data.data.length
      : null,
  });

  console.log("SHIPROCKET NESTED DATA SAFE DEBUG", {
    firstItem:
      Array.isArray(result?.data?.data)
        ? {
            type: typeof result.data.data[0],
            keys:
              result.data.data[0] &&
              typeof result.data.data[0] === "object"
                ? Object.keys(result.data.data[0])
                : [],
            order_id: result.data.data[0]?.order_id ?? null,
            shipment_id: result.data.data[0]?.shipment_id ?? null,
            orderId: result.data.data[0]?.orderId ?? null,
            shipmentId: result.data.data[0]?.shipmentId ?? null,
            status: result.data.data[0]?.status ?? null,
            status_code: result.data.data[0]?.status_code ?? null,
          }
        : null,
  });

  if (Array.isArray(result?.data?.data)) {
    console.log("SHIPROCKET NESTED ARRAY DEBUG", {
      length: result.data.data.length,
      itemTypes: result.data.data.map((item) => typeof item),
      rawItem0:
        typeof result.data.data[0] === "object"
          ? JSON.stringify(result.data.data[0])
          : String(result.data.data[0]),
    });
  }

  const orderData =
    result?.response?.data?.data ||
    result?.response?.data ||
    result?.data?.data ||
    result?.data ||
    result;

  const shiprocketOrderId =
    orderData?.order_id ??
    orderData?.orderId ??
    null;

  const shipmentId =
    orderData?.shipment_id ??
    orderData?.shipmentId ??
    null;

  const status =
    orderData?.status ??
    result?.status ??
    "NEW";

  const statusCode =
    orderData?.status_code ??
    orderData?.statusCode ??
    result?.status_code ??
    result?.statusCode ??
    null;

  console.log("SHIPROCKET CREATE DEBUG", {
    isArray: Array.isArray(result),
    rootKeys: result ? Object.keys(result) : [],
    dataKeys:
      result?.data && typeof result.data === "object"
        ? Object.keys(result.data)
        : [],
    responseKeys:
      result?.response && typeof result.response === "object"
        ? Object.keys(result.response)
        : [],
    responseDataKeys:
      result?.response?.data &&
      typeof result.response.data === "object"
        ? Object.keys(result.response.data)
        : [],
  });

  console.log("SHIPROCKET CREATE IDS DEBUG", {
    rootOrderId: result?.order_id ?? null,
    rootShipmentId: result?.shipment_id ?? null,

    dataOrderId: result?.data?.order_id ?? null,
    dataShipmentId: result?.data?.shipment_id ?? null,

    responseOrderId: result?.response?.order_id ?? null,
    responseShipmentId: result?.response?.shipment_id ?? null,

    responseDataOrderId: result?.response?.data?.order_id ?? null,
    responseDataShipmentId: result?.response?.data?.shipment_id ?? null,
  });

  console.log("SHIPROCKET RAW DATA DEBUG", {
    keys: result ? Object.keys(result) : [],
    order_id: result?.order_id ?? null,
    shipment_id: result?.shipment_id ?? null,
    nestedDataKeys:
      result?.data && typeof result.data === "object"
        ? Object.keys(result.data)
        : [],
  });

  console.log("SHIPROCKET NORMALIZED PAYLOAD DEBUG", {
    orderDataKeys:
      orderData && typeof orderData === "object"
        ? Object.keys(orderData)
        : [],
    orderId: shiprocketOrderId,
    shipmentId,
    status,
    statusCode,
  });

  log.info("Shiprocket order created successfully", {
    internalOrderId: order._id,
    shiprocketOrderId,
    shipmentId,
    status,
  });

  return {
    ...result,
    order_id: shiprocketOrderId,
    shipment_id: shipmentId,
    status,
    status_code: statusCode,
    data: orderData,
  };
};

/**
 * Helper to calculate volumetric and applicable weight
 * volumetricWeight = (length * breadth * height) / 5000
 * applicableWeight = Math.max(actualWeight, volumetricWeight)
 */
const calculateApplicableWeight = ({ weight = 0, length = 0, breadth = 0, height = 0 }) => {
  const actualWeight = parseFloat(weight) || 0;
  const l = parseFloat(length) || 0;
  const b = parseFloat(breadth) || 0;
  const h = parseFloat(height) || 0;

  let volumetricWeight = 0;
  if (l > 0 && b > 0 && h > 0) {
    volumetricWeight = Math.round(((l * b * h) / 5000) * 100) / 100;
  }

  const applicableWeight = Math.max(actualWeight, volumetricWeight) || actualWeight || config.defaultDimensions.weight;
  const finalWeight = Math.round(applicableWeight * 100) / 100;

  return {
    actualWeight,
    volumetricWeight,
    applicableWeight: finalWeight,
  };
};

/**
 * 2. Check Courier Serviceability (/courier/serviceability/)
 */
const checkServiceability = async ({
  pickupPostcode,
  deliveryPostcode,
  weight,
  cod,
  declaredValue,
  length,
  breadth,
  height,
  isReturn = 0,
}) => {
  const { actualWeight, volumetricWeight, applicableWeight } = calculateApplicableWeight({
    weight,
    length,
    breadth,
    height,
  });

  const isCod = cod === true || cod === "1" || cod === "true" || cod === 1;

  const queryParams = {
    pickup_postcode: String(pickupPostcode || "").trim(),
    delivery_postcode: String(deliveryPostcode || "").trim(),
    weight: String(applicableWeight),
    cod: isCod ? "1" : "0",
    is_return: String(isReturn || 0),
  };

  const parsedDeclaredValue = parseFloat(declaredValue);
  if (!isNaN(parsedDeclaredValue) && parsedDeclaredValue > 0) {
    queryParams.declared_value = String(parsedDeclaredValue);
    queryParams.order_sub_total = String(parsedDeclaredValue);
    queryParams.sub_total = String(parsedDeclaredValue);
    if (isCod) {
      queryParams.cod_amount = String(parsedDeclaredValue);
    }
  }

  const l = parseFloat(length) || 0;
  const b = parseFloat(breadth) || 0;
  const h = parseFloat(height) || 0;

  if (l > 0) queryParams.length = String(l);
  if (b > 0) queryParams.breadth = String(b);
  if (h > 0) queryParams.height = String(h);

  const params = new URLSearchParams(queryParams);

  console.log("SHIPROCKET OUTGOING SERVICEABILITY REQUEST:", {
    pickup_postcode: queryParams.pickup_postcode,
    delivery_postcode: queryParams.delivery_postcode,
    weight: queryParams.weight,
    cod: queryParams.cod,
    declared_value: queryParams.declared_value,
    length: queryParams.length,
    breadth: queryParams.breadth,
    height: queryParams.height,
    is_return: queryParams.is_return,
  });

  const finalUrl = `${config.baseUrl}/courier/serviceability/?${params.toString()}`;
  console.log("SHIPROCKET FINAL URL:", finalUrl);
  console.log("SHIPROCKET PARAMS OBJECT:", queryParams);

  const result = await request(`/courier/serviceability/?${params.toString()}`, {
    method: "GET",
  });

  const couriers = result?.data?.available_courier_companies || [];
  const ekartAmazonSummary = couriers
    .filter((c) => {
      const name = String(c.courier_name || "").toLowerCase();
      return name.includes("ekart") || name.includes("amazon");
    })
    .map((c) => ({
      courier_name: c.courier_name,
      freight_charge: c.freight_charge,
      cod_charges: c.cod_charges,
      rate: c.rate,
      charge_weight: c.charge_weight || c.chargeable_weight,
      coverage_charges: c.coverage_charges,
      other_charges: c.other_charges,
      surge: c.surge,
      zone: c.zone,
      recommended_lt: c.recommended_lt || c.is_recommended,
    }));

  console.log("SHIPROCKET RESPONSE SUMMARY (Ekart & Amazon):", JSON.stringify(ekartAmazonSummary, null, 2));

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
  calculateApplicableWeight,
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
