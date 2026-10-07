const XLSX = require("xlsx");
const { asyncHandler } = require("../../common/asyncHandler");
const ApiResponse = require("../../utils/ApiResponse");
const mongoose = require("mongoose");
const Cart = require("../../models/cartModel");
const Address = require("../../models/addressModel");
const Product = require("../../models/productsModel");
const Order = require("../../models/orderModel");
const Category = require("../../models/categoryModel");
const Bundle = require("../../models/bundleModel");
const User = require("../../models/userModel");
const {
  calculateShippingCost,
  calculateShippingByZone,
} = require("../../utils/shipping/calculateShipping");
const {
  sendOrderConfirmationEmails,
  sendStatusUpdateEmails,
} = require("../../utils/email/directEmailService");
const { sendEmail } = require("../../utils/email/emailService");
const {
  generateCustomerOrderConfirmation,
  generateCompanyOrderNotification,
  generateCustomerOrderUpdate,
  generateCompanyOrderUpdate,
} = require("../../utils/email/templates/orderConfirmation");
const Admin = require("../../models/adminModel");
const Inventory = require("../../models/inventoryModel");
const razorpay = require("../../config/razorpay");
const InventoryService = require("../../services/inventory/index.js");
const CouponService = require("../../services/coupon/index.js");
const { getAvailableStock } = require("../../utils/inventory/getAvailableStock.js");
const {
  getProductQuantityOptions,
  resolveProductUnitPrice,
} = require("../../utils/pricing/index.js");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { uploadPDF } = require("../../utils/upload");
const { buildOrderBillPdfBuffer } = require("../../utils/pdf/orderBill.js");
const ShiprocketService = require("../../services/shiprocket/index.js");

// Idempotently syncs an order with Shiprocket to create a shipping order.
// Does not throw — records error on order and logs sanitized message if failure occurs.
const syncOrderToShiprocket = async (order, { packageDetails = null, pickupLocation = null, logErrors = true } = {}) => {
  if (!order) return null;

  // If user is referenced but not populated, populate it
  if (order.user && !order.user.name && typeof order.populate === "function") {
    await order.populate("user");
  }

  // Idempotency check: if already has shiprocketOrderId, return existing info
  if (order.shipping && order.shipping.shiprocketOrderId) {
    return {
      success: true,
      alreadyCreated: true,
      shiprocketOrderId: order.shipping.shiprocketOrderId,
      shipmentId: order.shipping.shipmentId,
    };
  }

  try {
    const result = await ShiprocketService.createOrder(order, {
      pickupLocation,
      packageDetails,
    });
    if (!order.shipping) {
      order.shipping = {};
    }
    order.shipping.provider = "shiprocket";
    order.shipping.shiprocketOrderId = result.order_id ? String(result.order_id) : null;
    order.shipping.shipmentId = result.shipment_id ? String(result.shipment_id) : null;
    order.shipping.status = result.status || "NEW";
    order.shipping.statusCode = result.status_code || null;
    order.shipping.error = null;
    await order.save();
    return {
      success: true,
      data: result,
    };
  } catch (err) {
    if (logErrors) {
      console.error(`[Shiprocket Sync Error] Failed to sync order ${order._id}:`, err.message);
    }
    if (!order.shipping) {
      order.shipping = {};
    }
    order.shipping.error = err.message;
    await order.save().catch((saveErr) => console.error("Failed to save shipping error on order:", saveErr.message));
    return {
      success: false,
      error: err.message,
    };
  }
};


// Idempotently generates + uploads the order's invoice PDF (skipped if
// order.billUrl is already set) and persists the resulting URL on the order.
// Safe to call any time an order's status becomes "confirmed" or later.
const ensureOrderBillGenerated = async (order, { force = false } = {}) => {
  if (order.billUrl && !force) return order;

  let customer;
  if (order.isGuestOrder) {
    customer = {
      name: order.guestInfo?.name,
      email: order.guestInfo?.email,
      mobile: order.guestInfo?.mobile,
    };
  } else {
    const billedUser = await User.findById(order.user).select("name email phone");
    customer = {
      name: billedUser?.name,
      email: billedUser?.email,
      mobile: billedUser?.phone,
    };
  }

  const buffer = await buildOrderBillPdfBuffer({
    order: order.toObject(),
    customer,
  });

  const tempFilePath = path.join(os.tmpdir(), `invoice-${order._id}-${Date.now()}.pdf`);
  await fs.writeFile(tempFilePath, buffer);
  const url = await uploadPDF(tempFilePath, "invoices");

  order.billUrl = url;
  order.billGeneratedAt = new Date();
  await order.save();

  return order;
};

// Resolves a product order line's per-unit MRP and per-unit charged price (tier-aware) for a given quantity.
// Supports both base products and variants with bulk price tiers.
const resolveOrderItemUnitPrices = (product, quantity, variantSku = null) => {
  let variantObj = null;
  if (variantSku && Array.isArray(product.variants)) {
    variantObj = product.variants.find(
      (v) => v.sku === variantSku || v._id?.toString() === variantSku?.toString()
    );
  }

  if (variantObj) {
    const price = parseFloat((variantObj.price ?? product.price).toString());
    const discountedPrice = resolveProductUnitPrice(variantObj, quantity);
    return { price, discountedPrice, variantObj };
  }

  const price = parseFloat(product.price.toString());
  const discountedPrice = resolveProductUnitPrice(product, quantity);
  return { price, discountedPrice, variantObj: null };
};

// Resolves a product order item snapshot including variant pricing, title, images, and variant_sku
const resolveProductOrderItem = (product, quantity, variantSku = null) => {
  const { price, discountedPrice, variantObj } = resolveOrderItemUnitPrices(
    product,
    quantity,
    variantSku
  );

  const itemTotal = price * quantity;
  const discountedItemTotal = discountedPrice * quantity;

  const itemWeight = (variantObj && variantObj.weight_in_grams !== undefined)
    ? variantObj.weight_in_grams
    : (product.weight_in_grams || 0);
  const weightTotal = itemWeight * quantity;

  const vImg = (variantObj?.images && variantObj.images[0]) || variantObj?.image || variantObj?.banner_image;
  const pImages = (variantObj?.images && variantObj.images.length > 0) ? variantObj.images : (product.images || []);
  const pBannerImage = vImg || product.banner_image || (pImages.length > 0 ? pImages[0] : null);
  const pImage = vImg || (pImages.length > 0 ? pImages[0] : null) || product.banner_image || null;

  const orderItem = {
    type: "product",
    product: {
      _id: product._id,
      name: variantObj?.name || product.name,
      price: price,
      discounted_price: discountedPrice,
      banner_image: pBannerImage,
      image: pImage,
      images: pImages,
      sub_category: product.sub_category,
    },
    variant_sku: variantSku || null,
    quantity,
    total_amount: itemTotal,
    discounted_total_amount: discountedItemTotal,
  };

  return { orderItem, itemTotal, discountedItemTotal, weightTotal };
};

// Checks live stock for a product or variant against Inventory DB records and Product fallbacks.
const checkProductStock = async (productId, variantSku = null, requestedQuantity = 1) => {
  const product = await Product.findById(productId);
  if (!product) {
    return {
      found: false,
      product: null,
      variantObj: null,
      productName: "Unknown Product",
      productId: productId ? productId.toString() : null,
      variantId: null,
      requestedQuantity,
      availableStock: 0,
      isAvailable: false,
    };
  }

  const vObj =
    variantSku && Array.isArray(product.variants)
      ? product.variants.find(
          (v) => v.sku === variantSku || v._id?.toString() === variantSku
        )
      : null;

  const invQuery = { product: product._id, variant_sku: variantSku || null };
  const inv = await Inventory.findOne(invQuery).lean();

  const productForStock = product.toObject ? product.toObject() : { ...product };

  if (inv) {
    const avail = Math.max(
      (inv.quantity_on_hand || 0) - (inv.reserved_quantity || 0),
      0
    );
    if (variantSku && Array.isArray(productForStock.variants)) {
      productForStock.variants = productForStock.variants.map((v) => {
        if (v.sku === variantSku || v._id?.toString() === variantSku) {
          return {
            ...v,
            available_inventory: avail,
            qty_on_hand: inv.quantity_on_hand,
          };
        }
        return v;
      });
    } else {
      productForStock.base_available_inventory = avail;
      productForStock.qty_on_hand = inv.quantity_on_hand;
    }
  }

  const availableStock = getAvailableStock(productForStock, variantSku);
  const isAvailable = availableStock > 0 && requestedQuantity <= availableStock;
  const productName = vObj?.name || product.name;
  const variantId = vObj?._id ? vObj._id.toString() : null;

  return {
    found: true,
    product,
    variantObj: vObj,
    productName,
    productId: product._id.toString(),
    variantId,
    requestedQuantity,
    availableStock: Math.max(availableStock, 0),
    isAvailable,
  };
};

const exportOrders = asyncHandler(async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = {};
    if (start_date || end_date) {
      dateFilter.createdAt = {};
      if (start_date) dateFilter.createdAt.$gte = new Date(start_date);
      if (end_date) dateFilter.createdAt.$lte = new Date(end_date);
    }

    // Fetch orders with user, address, and items populated
    const orders = await Order.find(dateFilter)
      .populate("user")
      .populate("address")
      .populate("items.product")
      .lean();

    // Prepare data for XLSX
    const xlsxData = orders.map((order) => ({
      orderNumber: order.orderNumber ? `#OD-${order.orderNumber}` : `#OD-${order._id.toString()}`,
      orderDate: order.createdAt,
      userName: order.user?.name || "",
      userEmail: order.user?.email || "",
      userPhone: order.user?.phone || order.address?.mobile || order.guestInfo?.mobile || "",
      address: order.address
        ? `${order.address.address || ""}, ${order.address.city || ""}, ${order.address.state || ""}, ${order.address.pincode || ""}`
        : "",
      items: order.items
        .map((item) => `${item.product?.name || ""} (x${item.quantity})`)
        .join("; "),

      totalAmount: order.finalTotalAmount
        ? order.finalTotalAmount.toString()
        : "0",

      shippingCost: order.shippingCost ? order.shippingCost.toString() : "0",

      isGuestOrder: order.isGuestOrder ? "Yes" : "No",
      status: order.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(xlsxData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Use existing uploadPDF utility to upload the Excel buffer as a file
    const fs = require("fs/promises");
    const path = require("path");
    const { uploadPDF } = require("../../utils/upload");

    // Write buffer to a temporary file
    const tempFileName = `orders_export_${Date.now()}.xlsx`;
    const tempFilePath = path.join(__dirname, "../../uploads/", tempFileName);
    await fs.writeFile(tempFilePath, buffer);

    // Upload to Cloudinary as raw file
    const url = await uploadPDF(tempFilePath, "exports");
    return res.json({ url });
  } catch (err) {
    console.error("Export Orders Error:", err);
    return res.status(500).json({ error: "Failed to export orders" });
  }
});

const getAllOrders = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Unauthorized", false));
  }

  const {
    service_id,
    page = 1,
    per_page = 50,
    search = "",
    start_date,
    end_date,
    status,
  } = req.query;

  try {
    let query = {};

    if (service_id) {
      if (!mongoose.Types.ObjectId.isValid(service_id)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid service_id format", false));
      }
      const serviceObjectId = new mongoose.Types.ObjectId(service_id);
      const categoryIds = await Category.find({
        service: serviceObjectId,
      }).distinct("_id");
      if (categoryIds.length === 0) {
        return res
          .status(404)
          .json(
            new ApiResponse(
              404,
              null,
              "No categories found for this service",
              false,
            ),
          );
      }
      const productIds = await Product.find({
        sub_category: { $in: categoryIds },
      }).distinct("_id");
      if (productIds.length === 0) {
        return res
          .status(404)
          .json(
            new ApiResponse(
              404,
              null,
              "No products found in these categories",
              false,
            ),
          );
      }
      query["items.product._id"] = { $in: productIds };
    }

    if (search.trim()) {
      const productIdsByName = await Product.find({
        name: { $regex: search, $options: "i" },
      }).distinct("_id");
      query["$or"] = [
        { orderNumber: { $regex: search, $options: "i" } },
        { "items.product._id": { $in: productIdsByName } },
      ];
    }

    if (start_date || end_date) {
      query.createdAt = {};
      if (start_date) query.createdAt.$gte = new Date(start_date);
      if (end_date) query.createdAt.$lte = new Date(end_date);
    }

    if (status) {
      query.status = status;
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * per_page)
        .limit(parseInt(per_page, 10)),
      Order.countDocuments(query),
    ]);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { data: orders, total },
          "Orders fetched successfully",
          true,
        ),
      );
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Server error", false));
  }
});

const createGuestOrder = asyncHandler(async (req, res) => {
  const { items, address, paymentMode, utr_number } = req.body;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Items array is required and cannot be empty",
          false,
        ),
      );
  }

  if (!["COD", "UPI", "ONLINE"].includes(paymentMode)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "paymentMode must be 'COD', 'UPI', or 'ONLINE'",
          false,
        ),
      );
  }

  // Validate address
  if (
    !address ||
    !address.name ||
    !address.mobile ||
    !address.pincode ||
    !address.city ||
    !address.state
  ) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Address with name, mobile, pincode, city, and state is required",
          false,
        ),
      );
  }

  let totalAmount = 0;
  let discountedTotalAmount = 0;
  let totalWeightGrams = 0;
  const orderItems = [];
  const outOfStockItems = [];

  for (const item of items) {
    const quantity = Number(item.quantity) || 1;
    if (item.type === "product") {
      if (
        !item.product_id ||
        !mongoose.Types.ObjectId.isValid(item.product_id)
      ) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              `Invalid product_id: ${item.product_id}`,
              false,
            ),
          );
      }

      const stockCheck = await checkProductStock(
        item.product_id,
        item.variant_sku,
        quantity
      );

      if (!stockCheck.found) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              `Product not found: ${item.product_id}`,
              false,
            ),
          );
      }

      if (!stockCheck.isAvailable) {
        outOfStockItems.push({
          productId: stockCheck.productId,
          variantId: stockCheck.variantId,
          productName: stockCheck.productName,
          requestedQuantity: quantity,
          availableStock: stockCheck.availableStock,
        });
        continue;
      }

      const { orderItem, itemTotal, discountedItemTotal, weightTotal } = resolveProductOrderItem(
        stockCheck.product,
        quantity,
        item.variant_sku
      );
      totalAmount += itemTotal;
      discountedTotalAmount += discountedItemTotal;
      totalWeightGrams += weightTotal;
      orderItems.push(orderItem);
    } else if (item.type === "bundle") {
      if (!item.bundle_id || !mongoose.Types.ObjectId.isValid(item.bundle_id)) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              `Invalid bundle_id: ${item.bundle_id}`,
              false,
            ),
          );
      }

      const bundle = await Bundle.findById(item.bundle_id);
      if (!bundle) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              `Bundle not found: ${item.bundle_id}`,
              false,
            ),
          );
      }

      let bundleOutOfStock = false;
      if (bundle.products && Array.isArray(bundle.products)) {
        for (const bundleProduct of bundle.products) {
          const compQty = (bundleProduct.quantity || 1) * quantity;
          const compCheck = await checkProductStock(
            bundleProduct.product,
            bundleProduct.variant_sku,
            compQty
          );
          if (!compCheck.isAvailable) {
            bundleOutOfStock = true;
            outOfStockItems.push({
              productId: compCheck.productId,
              variantId: compCheck.variantId,
              productName: `${bundle.name} - ${compCheck.productName}`,
              requestedQuantity: compQty,
              availableStock: compCheck.availableStock,
            });
          }
        }
      }

      if (bundleOutOfStock) {
        continue;
      }

      const price = parseFloat(bundle.price.toString());
      const discountedPrice = bundle.discounted_price
        ? parseFloat(bundle.discounted_price.toString())
        : price;
      const itemTotal = price * quantity;
      const discountedItemTotal = discountedPrice * quantity;
      totalAmount += itemTotal;
      discountedTotalAmount += discountedItemTotal;

      // Calculate weight for bundles - sum up all products in the bundle
      if (bundle.products && Array.isArray(bundle.products)) {
        for (const bundleProduct of bundle.products) {
          const product = await Product.findById(bundleProduct.product);
          if (product && product.weight_in_grams) {
            totalWeightGrams +=
              product.weight_in_grams * bundleProduct.quantity * quantity;
          }
        }
      }

      orderItems.push({
        type: "bundle",
        bundle: {
          _id: bundle._id,
          name: bundle.name,
          price: bundle.price,
          discounted_price: bundle.discounted_price,
          images: bundle.images,
          description: bundle.description,
          products: bundle.products,
        },
        quantity: quantity,
        total_amount: itemTotal,
        discounted_total_amount: discountedItemTotal,
      });
    } else {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Invalid item type: ${item.type}. Must be 'product' or 'bundle'`,
            false,
          ),
        );
    }
  }

  if (outOfStockItems.length > 0) {
    const firstItemName = outOfStockItems[0].productName;
    return res.status(400).json({
      success: false,
      message: `Item "${firstItemName}" is currently out of stock or requested quantity is unavailable.`,
      outOfStockItems,
    });
  }

  if (orderItems.length === 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No valid items found", false));
  }

  // Create address snapshot
  const addressSnapshot = {
    name: address.name,
    mobile: address.mobile,
    pincode: address.pincode,
    locality: address.locality || "",
    address: address.address || "",
    city: address.city,
    state: address.state,
    landmark: address.landmark || "",
    alternatePhone: address.alternatePhone || "",
    addressType: address.addressType || "home",
  };

  // Orders under ₹2000 incur a flat ₹50 shipping charge
  const { shippingCost, shippingDetails } = await calculateShippingCost(
    discountedTotalAmount,
  );

  // Calculate final total amount (discounted total + shipping)
  const finalTotalAmount = discountedTotalAmount + shippingCost;

  const order = new Order({
    user: null,
    isGuestOrder: true,
    guestInfo: {
      email: address.email || null,
      name: address.name,
      mobile: address.mobile,
    },
    items: orderItems,
    address: addressSnapshot,
    totalAmount,
    discountedTotalAmount,
    shippingCost,
    shippingDetails,
    finalTotalAmount,
    paymentMode,
    utr_number: utr_number || null,
    status: "pending",
  });
  await order.save();

  // Deduct inventory asynchronously (non-blocking, best-effort)
  InventoryService.deductForOrder(order).catch((error) =>
    console.error(`Inventory deduction failed for order ${order._id}:`, error.message),
  );

  // Mark email as queued initially
  order.emailTracking = {
    confirmation: {
      status: "queued",
      queuedAt: new Date(),
      attempts: 0,
    },
    statusUpdates: [],
  };
  await order.save();

  // Send emails asynchronously (non-blocking) - only if guest email is provided
  if (address.email) {
    (async () => {
      try {
        // Create guest user object for email template
        const guestUser = {
          name: address.name,
          email: address.email,
        };

        // Send customer email
        const customerHtmlContent = generateCustomerOrderConfirmation(
          order.toObject(),
          guestUser,
        );

        const customerEmailOptions = {
          to: address.email,
          subject: `Order Received - ${order._id}`,
          html: customerHtmlContent,
        };

        const customerEmailSent = await sendEmail(customerEmailOptions);

        if (customerEmailSent.success) {
          console.log(
            "✅ Guest order confirmation email sent successfully to customer",
          );
          order.emailTracking.confirmation.status = "sent";
          order.emailTracking.confirmation.sentAt = new Date();
          await order.save();
        }

        // Send admin email
        const admins = await Admin.find({
          role: { $in: ["super_admin", "admin"] },
        }).select("email");

        const adminEmails = admins.map((admin) => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const adminHtmlContent = generateCompanyOrderNotification(
            order.toObject(),
            guestUser,
          );
          const adminEmailOptions = {
            to: 'helpshagunbeauty@gmail.com', 
            subject: `🛒 Order #${order.orderNumber} - ${new Date().toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})} - ₹${order.finalTotalAmount} from ${order.address?.city}, ${order.address?.state}`,
            html: adminHtmlContent,
          };

          const adminEmailSent = await sendEmail(adminEmailOptions);

          if (adminEmailSent.success) {
            console.log(
              "✅ New guest order notification sent successfully to admin",
            );
          } else {
            console.error(
              "❌ Failed to send new guest order notification to admin",
            );
          }
        }
      } catch (error) {
        console.error(
          "❌ Failed to send guest order confirmation email:",
          error.message,
        );
        order.emailTracking.confirmation.status = "failed";
        order.emailTracking.confirmation.failedAt = new Date();
        order.emailTracking.confirmation.error = error.message;
        await order.save();
      }
    })();
  } else {
    // Still send admin notification even if no guest email
    (async () => {
      try {
        const admins = await Admin.find({
          role: { $in: ["super_admin", "admin"] },
        }).select("email");

        const adminEmails = admins.map((admin) => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const guestUser = {
            name: address.name,
            email: "No email provided",
          };

          const adminHtmlContent = generateCompanyOrderNotification(
            order.toObject(),
            guestUser,
          );
          const adminEmailOptions = {
            to: 'helpshagunbeauty@gmail.com',
            subject: `🛒 Order #${order.orderNumber} - ${new Date().toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})} - ₹${order.finalTotalAmount} from ${order.address?.city}, ${order.address?.state}`,
            html: adminHtmlContent,
          };

          await sendEmail(adminEmailOptions);
          console.log(
            "✅ New guest order notification sent successfully to admin",
          );
        }
      } catch (error) {
        console.error(
          "❌ Failed to send admin notification for guest order:",
          error.message,
        );
      }
    })();
  }

  return res
    .status(201)
    .json(
      new ApiResponse(201, order, "Guest order created successfully", true),
    );
});

const sendOrderNotificationEmailsAsync = async (order, user) => {
  // Mark email as queued initially
  order.emailTracking = {
    confirmation: {
      status: "queued",
      queuedAt: new Date(),
      attempts: 0,
    },
    statusUpdates: [],
  };
  await order.save();

  // Send emails asynchronously (non-blocking)
  (async () => {
    try {
      if (user && user.email) {
        const customerHtmlContent = generateCustomerOrderConfirmation(
          order.toObject(),
          user.toObject ? user.toObject() : user,
        );

        const customerEmailOptions = {
          to: user.email,
          subject: `Order Received - ${order._id}`,
          html: customerHtmlContent,
        };

        const customerEmailSent = await sendEmail(customerEmailOptions);

        if (customerEmailSent.success) {
          console.log(
            "✅ Order confirmation email sent successfully to customer",
          );
          order.emailTracking.confirmation.status = "sent";
          order.emailTracking.confirmation.sentAt = new Date();
          await order.save();
        }
      }

      // Send admin email
      const admins = await Admin.find({
        role: { $in: ["super_admin"] },
      }).select("email");

      const adminEmails = admins.map((admin) => admin.email).filter(Boolean);

      if (adminEmails.length > 0) {
        const adminHtmlContent = generateCompanyOrderNotification(
          order.toObject(),
          user.toObject ? user.toObject() : user,
        );
        const adminEmailOptions = {
          to: "helpshagunbeauty@gmail.com",
          subject: `🛒 Order #${order.orderNumber} - ${new Date().toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})} - ₹${order.finalTotalAmount} from ${order.address?.city}, ${order.address?.state}`,
          html: adminHtmlContent,
        };

        const adminEmailSent = await sendEmail(adminEmailOptions);

        if (adminEmailSent.success) {
          console.log("✅ New order notification sent successfully to admin");
        } else {
          console.error("❌ Failed to send new order notification to admin");
        }
      }
    } catch (error) {
      console.error(
        "❌ Failed to send order confirmation email:",
        error.message,
      );
      order.emailTracking.confirmation.status = "failed";
      order.emailTracking.confirmation.failedAt = new Date();
      order.emailTracking.confirmation.error = error.message;
      await order.save();
    }
  })();
};

const prepareCartOrderData = async ({
  userId,
  cartId,
  addressId,
  couponCode,
  selectedItemIds,
}) => {
  if (
    !mongoose.Types.ObjectId.isValid(cartId) ||
    !mongoose.Types.ObjectId.isValid(addressId)
  ) {
    const err = new Error("Invalid cart or address ID");
    err.statusCode = 400;
    throw err;
  }

  const cart = await Cart.findOne({ _id: cartId, user: userId });
  if (!cart || cart.items.length === 0) {
    const err = new Error("Cart not found or empty");
    err.statusCode = 400;
    throw err;
  }

  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    const err = new Error("Address not found");
    err.statusCode = 400;
    throw err;
  }

  const hasSelectedFilter =
    Array.isArray(selectedItemIds) && selectedItemIds.length > 0;
  const selectedSet = hasSelectedFilter
    ? new Set(selectedItemIds.map(String))
    : null;

  let totalAmount = 0;
  let discountedTotalAmount = 0;
  let totalWeightGrams = 0;
  const orderItems = [];
  const processedCartItemIds = [];
  const outOfStockItems = [];

  for (const cartItem of cart.items) {
    const pIdStr = cartItem.product ? cartItem.product.toString() : "";
    const bIdStr = cartItem.bundle ? cartItem.bundle.toString() : "";
    const vSku = cartItem.variant_sku || "base";
    const itemIdStr = cartItem._id ? cartItem._id.toString() : "";
    const itemCompositeKey = `${pIdStr || bIdStr}_${vSku}`;

    if (selectedSet) {
      const isSelected =
        selectedSet.has(itemIdStr) ||
        selectedSet.has(itemCompositeKey) ||
        selectedSet.has(pIdStr) ||
        selectedSet.has(bIdStr);
      if (!isSelected) {
        continue;
      }
    }

    const requestedQty = Number(cartItem.quantity) || 1;

    if (cartItem.type === "product") {
      const stockCheck = await checkProductStock(
        cartItem.product,
        cartItem.variant_sku,
        requestedQty
      );

      if (!stockCheck.found) {
        const err = new Error(`Product not found: ${cartItem.product}`);
        err.statusCode = 400;
        throw err;
      }

      if (!stockCheck.isAvailable) {
        outOfStockItems.push({
          productId: stockCheck.productId,
          variantId: stockCheck.variantId,
          productName: stockCheck.productName,
          requestedQuantity: requestedQty,
          availableStock: stockCheck.availableStock,
        });
        continue;
      }

      const { orderItem, itemTotal, discountedItemTotal, weightTotal } =
        resolveProductOrderItem(
          stockCheck.product,
          requestedQty,
          cartItem.variant_sku
        );
      totalAmount += itemTotal;
      discountedTotalAmount += discountedItemTotal;
      totalWeightGrams += weightTotal;
      orderItems.push(orderItem);
      if (cartItem._id) processedCartItemIds.push(cartItem._id.toString());
    } else if (cartItem.type === "bundle") {
      const bundle = await Bundle.findById(cartItem.bundle);
      if (!bundle) {
        const err = new Error(`Bundle not found: ${cartItem.bundle}`);
        err.statusCode = 400;
        throw err;
      }

      let bundleOutOfStock = false;
      if (bundle.products && Array.isArray(bundle.products)) {
        for (const bundleProduct of bundle.products) {
          const compQty = (bundleProduct.quantity || 1) * requestedQty;
          const compCheck = await checkProductStock(
            bundleProduct.product,
            bundleProduct.variant_sku,
            compQty
          );
          if (!compCheck.isAvailable) {
            bundleOutOfStock = true;
            outOfStockItems.push({
              productId: compCheck.productId,
              variantId: compCheck.variantId,
              productName: `${bundle.name} - ${compCheck.productName}`,
              requestedQuantity: compQty,
              availableStock: compCheck.availableStock,
            });
          }
        }
      }

      if (bundleOutOfStock) {
        continue;
      }

      const price = parseFloat(bundle.price.toString());
      const discountedPrice = bundle.discounted_price
        ? parseFloat(bundle.discounted_price.toString())
        : price;
      const itemTotal = price * requestedQty;
      const discountedItemTotal = discountedPrice * requestedQty;
      totalAmount += itemTotal;
      discountedTotalAmount += discountedItemTotal;

      if (bundle.products && Array.isArray(bundle.products)) {
        for (const bundleProduct of bundle.products) {
          const product = await Product.findById(bundleProduct.product);
          if (product && product.weight_in_grams) {
            totalWeightGrams +=
              product.weight_in_grams *
              bundleProduct.quantity *
              requestedQty;
          }
        }
      }

      orderItems.push({
        type: "bundle",
        bundle: {
          _id: bundle._id,
          name: bundle.name,
          price: bundle.price,
          discounted_price: bundle.discounted_price,
          images: bundle.images,
          description: bundle.description,
          products: bundle.products,
        },
        quantity: requestedQty,
        total_amount: itemTotal,
        discounted_total_amount: discountedItemTotal,
      });
      if (cartItem._id) processedCartItemIds.push(cartItem._id.toString());
    }
  }

  if (outOfStockItems.length > 0) {
    const firstItemName = outOfStockItems[0].productName;
    const err = new Error(
      `Item "${firstItemName}" is currently out of stock or requested quantity is unavailable.`
    );
    err.statusCode = 400;
    err.code = 400;
    err.isOutOfStock = true;
    err.outOfStockItems = outOfStockItems;
    throw err;
  }

  if (orderItems.length === 0) {
    const err = new Error(
      "No available items to order from cart."
    );
    err.statusCode = 400;
    throw err;
  }

  const addressSnapshot = { ...address.toObject() };
  delete addressSnapshot._id;
  delete addressSnapshot.user;
  delete addressSnapshot.createdAt;
  delete addressSnapshot.updatedAt;
  delete addressSnapshot.__v;

  let couponResult = null;
  let couponDiscountAmount = 0;
  if (couponCode) {
    couponResult = await CouponService.validateCoupon({
      code: couponCode,
      userId,
      orderTotal: discountedTotalAmount,
    });

    if (!couponResult.success) {
      const err = new Error(couponResult.message || "Invalid coupon code");
      err.statusCode = 400;
      throw err;
    }

    couponDiscountAmount = couponResult.discount_amount;
  }

  const { shippingCost, shippingDetails } = await calculateShippingCost(
    discountedTotalAmount,
  );

  const finalTotalAmount =
    discountedTotalAmount - couponDiscountAmount + shippingCost;

  return {
    cart,
    address,
    addressSnapshot,
    orderItems,
    processedCartItemIds,
    totalAmount,
    discountedTotalAmount,
    totalWeightGrams,
    couponResult,
    couponDiscountAmount,
    shippingCost,
    shippingDetails,
    finalTotalAmount,
  };
};

const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { cartId, addressId, couponCode, paymentMode, utr_number, selectedItemIds } = req.body;

  if (!["COD", "UPI", "ONLINE"].includes(paymentMode)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "paymentMode must be 'COD', 'UPI', or 'ONLINE'",
          false,
        ),
      );
  }

  let summary;
  try {
    summary = await prepareCartOrderData({
      userId,
      cartId,
      addressId,
      couponCode,
      selectedItemIds,
    });
  } catch (err) {
    if (err.outOfStockItems && Array.isArray(err.outOfStockItems)) {
      return res.status(400).json({
        success: false,
        message: err.message,
        outOfStockItems: err.outOfStockItems,
      });
    }
    return res
      .status(400)
      .json(new ApiResponse(400, null, err.message, false));
  }

  const order = new Order({
    user: userId,
    items: summary.orderItems,
    address: summary.addressSnapshot,
    totalAmount: summary.totalAmount,
    discountedTotalAmount: summary.discountedTotalAmount,
    shippingCost: summary.shippingCost,
    shippingDetails: summary.shippingDetails,
    coupon: summary.couponResult ? summary.couponResult.coupon._id : null,
    couponCode: summary.couponResult ? summary.couponResult.coupon.code : null,
    couponDiscountAmount: summary.couponDiscountAmount,
    finalTotalAmount: summary.finalTotalAmount,
    paymentMode,
    utr_number: utr_number || null,
    status: "pending",
  });
  await order.save();

  // Record coupon redemption (non-blocking best-effort, mirrors inventory deduction)
  if (summary.couponResult) {
    CouponService.applyCouponUsage({
      couponId: summary.couponResult.coupon._id,
      userId,
      orderId: order._id,
      discountAmount: summary.couponDiscountAmount,
      orderTotal: summary.discountedTotalAmount,
    }).catch((error) =>
      console.error(`Coupon usage recording failed for order ${order._id}:`, error.message),
    );
  }

  // Deduct inventory atomically on order placement
  try {
    await InventoryService.deductForOrder(order);
  } catch (error) {
    console.error(`Inventory deduction failed for order ${order._id}:`, error.message);
  }

  // Clear only ordered items from the user's active cart in DB
  const orderedIdsSet = new Set(summary.processedCartItemIds);
  summary.cart.items = summary.cart.items.filter((ci) => !orderedIdsSet.has(ci._id ? ci._id.toString() : ""));
  await summary.cart.save();

  // Send order confirmation emails
  const user = await User.findById(userId);
  if (user) {
    await sendOrderNotificationEmailsAsync(order, user);
  }

  return res
    .status(201)
    .json(new ApiResponse(201, order, "Order created successfully", true));
});

const getOrderHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [orders, total] = await Promise.all([
    Order.find({ user: userId }).sort({ createdAt: -1 }),
    Order.countDocuments({ user: userId }),
  ]);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { data: orders, total },
        "Orders fetched successfully",
        true,
      ),
    );
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, codPaymentMethod, paymentMethod, paymentStatus } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  if (!status) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Status is required", false));
  }

  const normalizedStatus =
    status === "out for delivery" ? "out_for_delivery" : status;

  // Validate status values
  const validStatuses = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "return_requested",
    "returned",
    "refund_initiated",
    "refunded",
    "refund_failed",
  ];
  if (!validStatuses.includes(normalizedStatus)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          false,
        ),
      );
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  const previousStatus = order.status;
  order.status = normalizedStatus;

  if (normalizedStatus === "out_for_delivery" && !order.outForDeliveryAt) {
    order.outForDeliveryAt = new Date();
  }

  if (normalizedStatus === "delivered" && !order.deliveredAt) {
    order.deliveredAt = new Date();
  }

  if (normalizedStatus === "return_requested") {
    order.returnStatus = order.returnStatus || "requested";
    order.returnRequestedAt = order.returnRequestedAt || new Date();
    if (req.body.returnReason || req.body.reason || req.body.notes) {
      order.returnReason = req.body.returnReason || req.body.reason || req.body.notes;
    }
  } else if (normalizedStatus === "returned") {
    order.returnStatus = "completed";
    order.returnedAt = order.returnedAt || new Date();
    if (req.body.returnReason || req.body.reason || req.body.notes) {
      order.returnReason = req.body.returnReason || req.body.reason || req.body.notes;
    }
  }

  // Handle COD payment collection at doorstep: Paid by Cash or UPI
  const selectedCodMethod = codPaymentMethod || paymentMethod;
  if (selectedCodMethod) {
    const normMethod =
      String(selectedCodMethod).toLowerCase().includes("upi") ? "upi" : "cash";
    order.codPaymentMethod = normMethod;
    order.paymentMethod = normMethod;
    order.paymentStatus = "paid";
    order.paidAt = order.paidAt || new Date();
  } else if (normalizedStatus === "delivered" && order.paymentMode === "COD") {
    if (paymentStatus === "paid" || req.body.paid) {
      order.paymentStatus = "paid";
      order.codPaymentMethod = order.codPaymentMethod || "cash";
      order.paymentMethod = order.paymentMethod || "cash";
      order.paidAt = order.paidAt || new Date();
    }
  }

  if (
    paymentStatus &&
    ["pending", "paid", "failed", "cancelled", "refund_initiated", "refunded", "refund_failed"].includes(paymentStatus)
  ) {
    order.paymentStatus = paymentStatus;
    if (paymentStatus === "paid" && !order.paidAt) {
      order.paidAt = new Date();
    }
  }

  if (normalizedStatus === "refund_initiated") {
    order.paymentStatus = "refund_initiated";
    order.refundStatus = "initiated";
    order.refundInitiatedAt = order.refundInitiatedAt || new Date();
    if (req.body.refundAmount !== undefined || req.body.amount !== undefined) {
      order.refundAmount = parseFloat(
        req.body.refundAmount !== undefined ? req.body.refundAmount : req.body.amount
      );
    } else if (!order.refundAmount) {
      order.refundAmount = parseFloat(order.finalTotalAmount.toString());
    }
    if (req.body.refundMode !== undefined || req.body.refundMethod !== undefined || req.body.mode !== undefined) {
      order.refundMode = req.body.refundMode || req.body.refundMethod || req.body.mode;
    }
    if (
      req.body.refundTransactionId !== undefined ||
      req.body.transactionId !== undefined ||
      req.body.utrNo !== undefined ||
      req.body.utr_number !== undefined
    ) {
      order.refundTransactionId =
        req.body.refundTransactionId ||
        req.body.transactionId ||
        req.body.utrNo ||
        req.body.utr_number;
    }
    if (req.body.refundTo !== undefined || req.body.destination !== undefined || req.body.to !== undefined) {
      order.refundTo = req.body.refundTo || req.body.destination || req.body.to;
    }
    if (req.body.refundReason !== undefined || req.body.reason !== undefined || req.body.notes !== undefined) {
      order.refundReason = req.body.refundReason || req.body.reason || req.body.notes;
    }
  } else if (normalizedStatus === "refunded") {
    order.paymentStatus = "refunded";
    order.refundStatus = "processed";
    order.refundedAt = order.refundedAt || new Date();
    if (req.body.refundAmount !== undefined || req.body.amount !== undefined) {
      order.refundAmount = parseFloat(
        req.body.refundAmount !== undefined ? req.body.refundAmount : req.body.amount
      );
    } else if (!order.refundAmount) {
      order.refundAmount = parseFloat(order.finalTotalAmount.toString());
    }
    if (req.body.refundMode !== undefined || req.body.refundMethod !== undefined || req.body.mode !== undefined) {
      order.refundMode = req.body.refundMode || req.body.refundMethod || req.body.mode;
    }
    if (
      req.body.refundTransactionId !== undefined ||
      req.body.transactionId !== undefined ||
      req.body.utrNo !== undefined ||
      req.body.utr_number !== undefined
    ) {
      order.refundTransactionId =
        req.body.refundTransactionId ||
        req.body.transactionId ||
        req.body.utrNo ||
        req.body.utr_number;
    }
    if (req.body.refundTo !== undefined || req.body.destination !== undefined || req.body.to !== undefined) {
      order.refundTo = req.body.refundTo || req.body.destination || req.body.to;
    }
    if (req.body.refundReason !== undefined || req.body.reason !== undefined || req.body.notes !== undefined) {
      order.refundReason = req.body.refundReason || req.body.reason || req.body.notes;
    }
  } else if (normalizedStatus === "refund_failed") {
    order.paymentStatus = "refund_failed";
    order.refundStatus = "failed";
    if (req.body.refundReason !== undefined || req.body.reason !== undefined || req.body.notes !== undefined) {
      order.refundReason = req.body.refundReason || req.body.reason || req.body.notes;
    }
  }
  await order.save();

  // Restore inventory asynchronously if the order was cancelled, refunded, or returned
  if (
    !["cancelled", "refunded", "returned"].includes(previousStatus) &&
    ["cancelled", "refunded", "returned"].includes(normalizedStatus)
  ) {
    InventoryService.restoreForCancelledOrder(order).catch((error) =>
      console.error(`Inventory restore failed for order ${order._id}:`, error.message),
    );
    CouponService.releaseCouponUsage(order._id).catch((error) =>
      console.error(`Coupon usage release failed for order ${order._id}:`, error.message),
    );
  }

  // Generate the invoice the first time an order is confirmed (no-op if it
  // already exists). Awaited so it's ready immediately for /bill, but
  // failure here must not block the status update itself.
  if (status === "confirmed") {
    try {
      await ensureOrderBillGenerated(order);
    } catch (error) {
      console.error(`Bill generation failed for order ${order._id}:`, error.message);
    }
  }

  // Send status update emails directly (async - won't block response)
  if (previousStatus !== normalizedStatus) {
    const user = order.user ? await User.findById(order.user) : null;
    const targetUser = user || (order.guestInfo?.email ? { name: order.guestInfo.name || "Customer", email: order.guestInfo.email } : (order.address?.email ? { name: order.address.name || "Customer", email: order.address.email } : null));
    if (targetUser && targetUser.email) {
      setImmediate(async () => {
        try {
          await sendStatusUpdateEmails({
            order: order.toObject(),
            user: typeof targetUser.toObject === "function" ? targetUser.toObject() : targetUser,
            previousStatus,
            updatedBy: req.admin ? req.admin.toObject() : null,
          });
        } catch (error) {
          console.error("❌ Failed to send status update emails:", error.message);
        }
      });
    }
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, order, "Order status updated successfully", true),
    );
});

const bulkUpdateOrderStatus = asyncHandler(async (req, res) => {
  const { updates, status } = req.body;

  console.log(">>>>", req.body);

  // Validate input
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "updates array with order IDs is required",
          false,
        ),
      );
  }

  if (!status) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Status is required", false));
  }

  const normalizedStatus =
    status === "out for delivery" ? "out_for_delivery" : status;

  // Validate status values
  const validStatuses = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "return_requested",
    "returned",
    "refund_initiated",
    "refunded",
    "refund_failed",
  ];
  if (!validStatuses.includes(normalizedStatus)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
          false,
        ),
      );
  }

  const results = {
    successful: [],
    failed: [],
    notFound: [],
  };

  // Process each order update
  for (const update of updates) {
    const orderId = update.id;

    // Validate order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      results.failed.push({
        orderId,
        error: "Invalid order ID format",
      });
      continue;
    }

    try {
      const order = await Order.findById(orderId);

      if (!order) {
        results.notFound.push({
          orderId,
          error: "Order not found",
        });
        continue;
      }

      const previousStatus = order.status;
      order.status = normalizedStatus;

      if (normalizedStatus === "out_for_delivery" && !order.outForDeliveryAt) {
        order.outForDeliveryAt = new Date();
      }
      if (normalizedStatus === "delivered" && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }

      if (normalizedStatus === "return_requested") {
        order.returnStatus = order.returnStatus || "requested";
        order.returnRequestedAt = order.returnRequestedAt || new Date();
      } else if (normalizedStatus === "returned") {
        order.returnStatus = "completed";
        order.returnedAt = order.returnedAt || new Date();
      }

      if (normalizedStatus === "refund_initiated") {
        order.paymentStatus = "refund_initiated";
        order.refundStatus = "initiated";
        order.refundInitiatedAt = new Date();
        if (!order.refundAmount) {
          order.refundAmount = order.finalTotalAmount;
        }
      } else if (normalizedStatus === "refunded") {
        order.paymentStatus = "refunded";
        order.refundStatus = "processed";
        order.refundedAt = new Date();
        if (!order.refundAmount) {
          order.refundAmount = order.finalTotalAmount;
        }
      } else if (normalizedStatus === "refund_failed") {
        order.paymentStatus = "refund_failed";
        order.refundStatus = "failed";
      }

      // Add status update email tracking entry
      if (!order.emailTracking) {
        order.emailTracking = { confirmation: {}, statusUpdates: [] };
      }
      order.emailTracking.statusUpdates.push({
        status: order.status,
        emailStatus: "queued",
        queuedAt: new Date(),
        attempts: 0,
      });

      await order.save();

      // Restore inventory asynchronously if the order was cancelled, refunded, or returned
      if (
        !["cancelled", "refunded", "returned"].includes(previousStatus) &&
        ["cancelled", "refunded", "returned"].includes(normalizedStatus)
      ) {
        InventoryService.restoreForCancelledOrder(order).catch((error) =>
          console.error(`Inventory restore failed for order ${order._id}:`, error.message),
        );
        CouponService.releaseCouponUsage(order._id).catch((error) =>
          console.error(`Coupon usage release failed for order ${order._id}:`, error.message),
        );
      }

      // Generate the invoice the first time an order is confirmed (no-op if
      // it already exists).
      if (status === "confirmed") {
        try {
          await ensureOrderBillGenerated(order);
        } catch (error) {
          console.error(`Bill generation failed for order ${order._id}:`, error.message);
        }
      }

      // Send status update email asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          const user = order.user ? await User.findById(order.user) : null;
          const targetUser = user || (order.guestInfo?.email ? { name: order.guestInfo.name || "Customer", email: order.guestInfo.email } : (order.address?.email ? { name: order.address.name || "Customer", email: order.address.email } : null));
          if (targetUser && targetUser.email) {
            await sendStatusUpdateEmails({
              order: order.toObject(),
              user: typeof targetUser.toObject === "function" ? targetUser.toObject() : targetUser,
              previousStatus,
              updatedBy: req.admin ? req.admin.toObject() : null,
            });
          }
        } catch (error) {
          console.error(
            `❌ Failed to send status update email for order ${orderId}:`,
            error.message,
          );
        }
      });

      results.successful.push({
        orderId,
        previousStatus,
        newStatus: status,
      });
    } catch (error) {
      results.failed.push({
        orderId,
        error: error.message,
      });
    }
  }

  // Prepare response
  const summary = {
    total: updates.length,
    successful: results.successful.length,
    failed: results.failed.length,
    notFound: results.notFound.length,
    details: {
      successful: results.successful,
      failed: results.failed,
      notFound: results.notFound,
    },
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        summary,
        `Bulk status update completed: ${results.successful.length} succeeded, ${results.failed.length} failed, ${results.notFound.length} not found`,
        true,
      ),
    );
});

const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }
  const order = await Order.findById(id).populate("coupon");
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order fetched successfully", true));
});

// Admin-only: returns the invoice PDF URL for an order so the admin FE can
// download/open it. Generates it on demand as a fallback if it's somehow
// missing for an order that has already been confirmed (idempotent - never
// regenerates once billUrl is set).
const getOrderBill = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  const force = req.query.regenerate === "true" || req.query.force === "true";
  if (!order.billUrl || force) {
    if (order.status === "pending") {
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            "Bill is only generated once the order is confirmed",
            false,
          ),
        );
    }

    try {
      await ensureOrderBillGenerated(order, { force });
    } catch (error) {
      console.error(`Bill generation failed for order ${order._id}:`, error.message);
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to generate bill", false));
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        order_id: order._id,
        order_number: order.orderNumber,
        bill_url: order.billUrl,
        filename: `invoice-${order.orderNumber || order._id}.pdf`,
        generated_at: order.billGeneratedAt,
      },
      "Bill fetched successfully",
      true,
    ),
  );
});

const getOrderByIdFormUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }
  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order fetched successfully", true));
});

const editOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }
  const order = await Order.findOne({ _id: id, user: userId });
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }
  if (order.status !== "pending") {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Only pending orders can be edited", false),
      );
  }

  const { addressId, items } = req.body;
  let addressSnapshot = order.address;
  let newAddress = null;
  if (addressId) {
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Address not found", false));
    }
    newAddress = address;
    addressSnapshot = { ...address.toObject() };
    delete addressSnapshot._id;
    delete addressSnapshot.user;
    delete addressSnapshot.createdAt;
    delete addressSnapshot.updatedAt;
    delete addressSnapshot.__v;
  }

  let totalAmount = 0;
  let discountedTotalAmount = 0;
  let totalWeightGrams = 0;
  const orderItems = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item.type === "product") {
        const product = await Product.findById(item.product);
        if (!product) continue;

        const { orderItem, itemTotal, discountedItemTotal, weightTotal } = resolveProductOrderItem(
          product,
          item.quantity,
          item.variant_sku
        );
        totalAmount += itemTotal;
        discountedTotalAmount += discountedItemTotal;
        totalWeightGrams += weightTotal;
        orderItems.push(orderItem);
      } else if (item.type === "bundle") {
        const bundle = await Bundle.findById(item.bundle);
        if (!bundle) continue;
        const price = parseFloat(bundle.price.toString());
        const discountedPrice = bundle.discounted_price
          ? parseFloat(bundle.discounted_price.toString())
          : price;
        const itemTotal = price * item.quantity;
        const discountedItemTotal = discountedPrice * item.quantity;
        totalAmount += itemTotal;
        discountedTotalAmount += discountedItemTotal;

        // Calculate weight for bundles
        if (bundle.products && Array.isArray(bundle.products)) {
          for (const bundleProduct of bundle.products) {
            const product = await Product.findById(bundleProduct.product);
            if (product && product.weight_in_grams) {
              totalWeightGrams +=
                product.weight_in_grams *
                bundleProduct.quantity *
                item.quantity;
            }
          }
        }

        orderItems.push({
          type: "bundle",
          bundle: {
            _id: bundle._id,
            name: bundle.name,
            price: bundle.price,
            discounted_price: bundle.discounted_price,
            images: bundle.images,
            description: bundle.description,
            products: bundle.products,
          },
          quantity: item.quantity,
          total_amount: itemTotal,
          discounted_total_amount: discountedItemTotal,
        });
      }
    }
  }

  if (orderItems.length > 0) {
    order.items = orderItems;
    order.totalAmount = totalAmount;
    order.discountedTotalAmount = discountedTotalAmount;
  } else {
    // If no items provided, recalculate weight from existing items
    for (const item of order.items) {
      if (item.type === "product" && item.product) {
        const product = await Product.findById(item.product._id);
        if (product && product.weight_in_grams) {
          totalWeightGrams += product.weight_in_grams * item.quantity;
        }
      } else if (item.type === "bundle" && item.bundle) {
        const bundle = await Bundle.findById(item.bundle._id);
        if (bundle && bundle.products && Array.isArray(bundle.products)) {
          for (const bundleProduct of bundle.products) {
            const product = await Product.findById(bundleProduct.product);
            if (product && product.weight_in_grams) {
              totalWeightGrams +=
                product.weight_in_grams *
                bundleProduct.quantity *
                item.quantity;
            }
          }
        }
      }
    }
    discountedTotalAmount = parseFloat(order.discountedTotalAmount.toString());
  }

  order.address = addressSnapshot;

  // Recalculate shipping if address or items changed (orders under ₹2000 incur a flat ₹50 shipping charge)
  if (newAddress || orderItems.length > 0) {
    const { shippingCost, shippingDetails } = await calculateShippingCost(
      discountedTotalAmount,
    );
    order.shippingCost = shippingCost;
    order.shippingDetails = shippingDetails;
    order.finalTotalAmount = discountedTotalAmount + shippingCost;
  }

  await order.save();

  // Send order edit confirmation email (async - won't block response)
  const user = await User.findById(order.user);

  // Add email tracking entry for order edit
  if (!order.emailTracking) {
    order.emailTracking = { confirmation: {}, statusUpdates: [] };
  }
  order.emailTracking.orderEdit = {
    emailStatus: "queued",
    queuedAt: new Date(),
    attempts: 0,
  };
  await order.save();

  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order updated successfully", true));
});

// User-initiated cancellation of their own order.
// Allowed ONLY before "out_for_delivery" (i.e. pending, confirmed, processing, shipped).
const cancelOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findOne({ _id: id, user: userId });
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  // Cancel is allowed only before out for delivery
  const cancellableStatuses = ["pending", "confirmed", "processing", "shipped"];
  if (!cancellableStatuses.includes(order.status)) {
    let message = `Order cannot be cancelled once it is ${order.status.replace(/_/g, " ")}`;
    if (order.status === "cancelled") {
      message = "Order is already cancelled";
    } else if (order.status === "out_for_delivery") {
      message = "Order cannot be cancelled once it is out for delivery";
    } else if (order.status === "delivered") {
      message = "Order cannot be cancelled once it is delivered";
    } else if (["return_requested", "returned"].includes(order.status)) {
      message = "Order cannot be cancelled as a return has already been requested or processed";
    }
    return res
      .status(400)
      .json(new ApiResponse(400, null, message, false));
  }

  const previousStatus = order.status;
  order.status = "cancelled";

  if (!order.emailTracking) {
    order.emailTracking = { confirmation: {}, statusUpdates: [] };
  }
  order.emailTracking.statusUpdates.push({
    status: order.status,
    emailStatus: "queued",
    queuedAt: new Date(),
    attempts: 0,
  });

  await order.save();

  InventoryService.restoreForCancelledOrder(order).catch((error) =>
    console.error(`Inventory restore failed for order ${order._id}:`, error.message),
  );
  CouponService.releaseCouponUsage(order._id).catch((error) =>
    console.error(`Coupon usage release failed for order ${order._id}:`, error.message),
  );

  setImmediate(async () => {
    try {
      const user = await User.findById(order.user);
      if (user) {
        await sendStatusUpdateEmails({
          order: order.toObject(),
          user: user.toObject(),
          previousStatus,
          updatedBy: null,
        });
      }
    } catch (error) {
      console.error(
        `❌ Failed to send cancellation email for order ${order._id}:`,
        error.message,
      );
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order cancelled successfully", true));
});

// User-initiated return of their own order.
// Allowed ONLY when the order status is "delivered".
const returnOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { reason, returnReason, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findOne({ _id: id, user: userId });
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  if (["return_requested", "returned"].includes(order.status)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          order.status === "return_requested"
            ? "A return request has already been submitted for this order"
            : "Order has already been returned",
          false,
        ),
      );
  }

  // Return rule: Return can ONLY be requested after order is delivered
  if (order.status !== "delivered") {
    let msg = `Order can only be returned after it has been delivered. Current status: ${order.status.replace(/_/g, " ")}`;
    if (order.status === "cancelled") {
      msg = "Cancelled orders cannot be returned";
    }
    return res
      .status(400)
      .json(new ApiResponse(400, null, msg, false));
  }

  const previousStatus = order.status;
  const targetReason = reason || returnReason || notes || "Customer return request";

  order.status = "return_requested";
  order.returnStatus = "requested";
  order.returnReason = targetReason;
  order.returnRequestedAt = new Date();

  if (!order.emailTracking) {
    order.emailTracking = { confirmation: {}, statusUpdates: [] };
  }
  order.emailTracking.statusUpdates.push({
    status: order.status,
    emailStatus: "queued",
    queuedAt: new Date(),
    attempts: 0,
  });

  await order.save();

  setImmediate(async () => {
    try {
      const user = await User.findById(order.user);
      if (user) {
        await sendStatusUpdateEmails({
          order: order.toObject(),
          user: user.toObject(),
          previousStatus,
          updatedBy: null,
        });
      }
    } catch (error) {
      console.error(
        `❌ Failed to send return request email for order ${order._id}:`,
        error.message,
      );
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order return requested successfully", true));
});

const getProductsWithOrderCounts = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      per_page = 50,
      search = "",
      status = "",
      sort_by = "totalOrders", // totalOrders, totalQuantity, totalRevenue, totalDiscountedRevenue
      sort_order = "desc", // asc, desc
    } = req.query;

    // Build query for orders based on status filter
    let orderQuery = {};
    if (status) {
      const validStatuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "return_requested",
        "returned",
        "refund_initiated",
        "refunded",
        "refund_failed",
      ];
      const normStatus =
        status === "out for delivery" ? "out_for_delivery" : status;
      if (validStatuses.includes(normStatus)) {
        orderQuery.status = normStatus;
      }
    }

    // Get orders with status filter
    const orders = await Order.find(orderQuery);
    const productOrderMap = {};

    // Iterate through filtered orders and count by product
    orders.forEach((order) => {
      order.items.forEach((item) => {
        if (item.type === "product" && item.product && item.product._id) {
          // Handle individual products
          const productId = item.product._id.toString();

          if (!productOrderMap[productId]) {
            // Convert Decimal128 fields to numbers for direct products
            productOrderMap[productId] = {
              product: {
                _id: item.product._id,
                name: item.product.name,
                sku: item.product.sku,
                price: item.product.price
                  ? parseFloat(item.product.price.toString())
                  : null,
                discounted_price: item.product.discounted_price
                  ? parseFloat(item.product.discounted_price.toString())
                  : null,
                banner_image: item.product.banner_image || (item.product.images && item.product.images[0]) || null,
                image: item.product.image || item.product.banner_image || (item.product.images && item.product.images[0]) || null,
                images: item.product.images || [],
              },
              totalOrders: 0,
              totalQuantity: 0,
              totalRevenue: 0,
              totalDiscountedRevenue: 0,
            };
          }

          productOrderMap[productId].totalOrders += 1;
          productOrderMap[productId].totalQuantity += item.quantity || 0;

          // Safe parsing with null checks
          const totalAmount = item.total_amount
            ? parseFloat(item.total_amount.toString())
            : 0;
          const discountedTotalAmount = item.discounted_total_amount
            ? parseFloat(item.discounted_total_amount.toString())
            : 0;

          // If discounted_total_amount is 0 or null, calculate it from the product's discounted price
          let finalDiscountedAmount = discountedTotalAmount;
          if (discountedTotalAmount === 0 && item.product.discounted_price) {
            const productDiscountedPrice = parseFloat(
              item.product.discounted_price.toString(),
            );
            const productQuantity = item.quantity || 0;
            finalDiscountedAmount = productDiscountedPrice * productQuantity;
          }

          productOrderMap[productId].totalRevenue += totalAmount;
          productOrderMap[productId].totalDiscountedRevenue +=
            finalDiscountedAmount;
        } else if (
          item.type === "bundle" &&
          item.bundle &&
          item.bundle.products
        ) {
          // Handle bundles - extract individual products from bundles
          item.bundle.products.forEach((bundleProduct) => {
            const productId = bundleProduct.product.toString();

            if (!productOrderMap[productId]) {
              productOrderMap[productId] = {
                product: {
                  _id: bundleProduct.product,
                  name: `Product from Bundle: ${item.bundle.name}`,
                  // We'll need to fetch actual product details
                },
                totalOrders: 0,
                totalQuantity: 0,
                totalRevenue: 0,
                totalDiscountedRevenue: 0,
              };
            }

            // Calculate quantity: bundle quantity * product quantity in bundle
            const totalProductQuantity =
              (item.quantity || 0) * (bundleProduct.quantity || 0);

            productOrderMap[productId].totalOrders += 1;
            productOrderMap[productId].totalQuantity += totalProductQuantity;

            // For bundles, we can't directly calculate individual product revenue
            // So we'll distribute bundle revenue proportionally
            const bundleRevenue = item.total_amount
              ? parseFloat(item.total_amount.toString())
              : 0;
            const bundleDiscountedRevenue = item.discounted_total_amount
              ? parseFloat(item.discounted_total_amount.toString())
              : 0;

            // Simple proportional distribution (you might want to improve this logic)
            const productCount = item.bundle.products.length;
            productOrderMap[productId].totalRevenue +=
              bundleRevenue / productCount;
            productOrderMap[productId].totalDiscountedRevenue +=
              bundleDiscountedRevenue / productCount;
          });
        }
      });
    });

    // Fetch actual product details for products that came from bundles
    for (const productId in productOrderMap) {
      if (
        productOrderMap[productId].product.name &&
        productOrderMap[productId].product.name.startsWith(
          "Product from Bundle:",
        )
      ) {
        const product = await Product.findById(productId);
        if (product) {
          productOrderMap[productId].product = {
            _id: product._id,
            name: product.name,
            sku: product.sku,
            price: product.price ? parseFloat(product.price.toString()) : null,
            discounted_price: product.discounted_price
              ? parseFloat(product.discounted_price.toString())
              : null,
            banner_image: product.banner_image || (product.images && product.images[0]) || null,
            image: product.image || (product.images && product.images[0]) || product.banner_image || null,
            images: product.images || [],
          };
        }
      }
    }

    // Convert to array and apply search filter
    let result = Object.values(productOrderMap);

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.product.name.toLowerCase().includes(searchLower) ||
          (item.product.sku &&
            item.product.sku.toLowerCase().includes(searchLower)),
      );
    }

    // Apply sorting
    const validSortFields = [
      "totalOrders",
      "totalQuantity",
      "totalRevenue",
      "totalDiscountedRevenue",
    ];
    const sortField = validSortFields.includes(sort_by)
      ? sort_by
      : "totalOrders";
    const sortDirection = sort_order === "asc" ? 1 : -1;

    result.sort((a, b) => {
      const aValue = a[sortField] || 0;
      const bValue = b[sortField] || 0;
      return (aValue - bValue) * sortDirection;
    });

    // Apply pagination
    const total = result.length;
    const startIndex = (page - 1) * per_page;
    const endIndex = startIndex + parseInt(per_page, 10);
    const paginatedResult = result.slice(startIndex, endIndex);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          data: paginatedResult,
          total,
        },
        "Products with order counts fetched successfully",
        true,
      ),
    );
  } catch (error) {
    console.error("Error fetching products with order counts:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Server error", false));
  }
});

// Order update function with safe field updates
const updateOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  try {
    // Update status if provided
    if (updateData.status) {
      const validStatuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "return_requested",
        "returned",
        "refund_initiated",
        "refunded",
        "refund_failed",
      ];

      const normStatus =
        updateData.status === "out for delivery"
          ? "out_for_delivery"
          : updateData.status;

      if (!validStatuses.includes(normStatus)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid status", false));
      }

      order.status = normStatus;
      if (normStatus === "out_for_delivery" && !order.outForDeliveryAt) {
        order.outForDeliveryAt = new Date();
      }
      if (normStatus === "delivered" && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }
    }

    if (updateData.addressId) {
      const address = await Address.findById(updateData.addressId);
      if (!address) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Address not found", false));
      }

      // Create address snapshot
      const addressSnapshot = { ...address.toObject() };
      delete addressSnapshot._id;
      delete addressSnapshot.user;
      delete addressSnapshot.createdAt;
      delete addressSnapshot.updatedAt;
      delete addressSnapshot.__v;

      order.address = addressSnapshot;
    }

    // Add new products to order
    if (updateData.addProducts && Array.isArray(updateData.addProducts)) {
      for (const productData of updateData.addProducts) {
        const { productId, quantity } = productData;
        const qty = parseInt(quantity);

        if (qty <= 0) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Quantity must be positive for product ${productId}`,
                false,
              ),
            );
        }

        // Check if product already exists in order
        const existingIndex = order.items.findIndex(
          (item) =>
            item.type === "product" &&
            item.product._id.toString() === productId,
        );

        if (existingIndex !== -1) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Product ${productId} already exists in order. Use 'products' array to update quantity.`,
                false,
              ),
            );
        }

        const product = await Product.findById(productId);
        if (!product) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Product ${productId} not found`,
                false,
              ),
            );
        }

        const pricing = resolveOrderItemUnitPrices(product, qty, productData.variant_sku);
        const { price, discountedPrice, variantObj } = pricing;
        const itemTotal = price * qty;
        const discountedItemTotal = discountedPrice * qty;

        // Add new product to order items
        order.items.push({
          type: "product",
          product: {
            _id: product._id,
            name: variantObj?.name || product.name,
            price: product.price,
            discounted_price: discountedPrice,
            banner_image: (variantObj?.images && variantObj.images[0]) || variantObj?.image || product.banner_image || (product.images && product.images[0]) || null,
            image: (variantObj?.images && variantObj.images[0]) || (product.images && product.images[0]) || product.banner_image || null,
            images: (variantObj?.images && variantObj.images.length > 0) ? variantObj.images : (product.images || []),
            sub_category: product.sub_category,
          },
          variant_sku: productData.variant_sku || null,
          quantity: qty,
          total_amount: mongoose.Types.Decimal128.fromString(
            itemTotal.toString(),
          ),
          discounted_total_amount: mongoose.Types.Decimal128.fromString(
            discountedItemTotal.toString(),
          ),
        });
      }
    }

    // Update existing products in order
    if (updateData.products && Array.isArray(updateData.products)) {
      for (const productUpdate of updateData.products) {
        const { productId, newQuantity } = productUpdate;
        const quantity = parseInt(newQuantity);

        if (quantity < 0) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Quantity cannot be negative for product ${productId}`,
                false,
              ),
            );
        }

        // Find the product in order items
        const itemIndex = order.items.findIndex(
          (item) =>
            item.type === "product" &&
            item.product._id.toString() === productId,
        );

        if (itemIndex === -1) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Product ${productId} not found in order. Use 'addProducts' array to add new products.`,
                false,
              ),
            );
        }

        if (quantity === 0) {
          // Remove item from order
          order.items.splice(itemIndex, 1);
        } else {
          // Update quantity
          const product = await Product.findById(productId);
          if (!product) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  `Product ${productId} not found`,
                  false,
                ),
              );
          }

          const pricing = resolveOrderItemUnitPrices(
            product,
            quantity,
            order.items[itemIndex].variant_sku
          );
          const { price, discountedPrice } = pricing;
          const itemTotal = price * quantity;
          const discountedItemTotal = discountedPrice * quantity;

          order.items[itemIndex].quantity = quantity;
          order.items[itemIndex].total_amount =
            mongoose.Types.Decimal128.fromString(itemTotal.toString());
          order.items[itemIndex].discounted_total_amount =
            mongoose.Types.Decimal128.fromString(
              discountedItemTotal.toString(),
            );
        }
      }
    }

    // Add new bundles to order
    if (updateData.addBundles && Array.isArray(updateData.addBundles)) {
      for (const bundleData of updateData.addBundles) {
        const { bundleId, quantity } = bundleData;
        const qty = parseInt(quantity);

        if (qty <= 0) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Quantity must be positive for bundle ${bundleId}`,
                false,
              ),
            );
        }

        // Check if bundle already exists in order
        const existingIndex = order.items.findIndex(
          (item) =>
            item.type === "bundle" && item.bundle._id.toString() === bundleId,
        );

        if (existingIndex !== -1) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Bundle ${bundleId} already exists in order. Use 'bundles' array to update quantity.`,
                false,
              ),
            );
        }

        const bundle = await Bundle.findById(bundleId);
        if (!bundle) {
          return res
            .status(400)
            .json(
              new ApiResponse(400, null, `Bundle ${bundleId} not found`, false),
            );
        }

        const price = parseFloat(bundle.price.toString());
        const discountedPrice = bundle.discounted_price
          ? parseFloat(bundle.discounted_price.toString())
          : price;
        const itemTotal = price * qty;
        const discountedItemTotal = discountedPrice * qty;

        // Add new bundle to order items
        order.items.push({
          type: "bundle",
          bundle: {
            _id: bundle._id,
            name: bundle.name,
            price: bundle.price,
            discounted_price: bundle.discounted_price,
            images: bundle.images,
            description: bundle.description,
            products: bundle.products,
          },
          quantity: qty,
          total_amount: mongoose.Types.Decimal128.fromString(
            itemTotal.toString(),
          ),
          discounted_total_amount: mongoose.Types.Decimal128.fromString(
            discountedItemTotal.toString(),
          ),
        });
      }
    }

    // Update existing bundles in order
    if (updateData.bundles && Array.isArray(updateData.bundles)) {
      for (const bundleUpdate of updateData.bundles) {
        const { bundleId, newQuantity } = bundleUpdate;
        const quantity = parseInt(newQuantity);

        if (quantity < 0) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Quantity cannot be negative for bundle ${bundleId}`,
                false,
              ),
            );
        }

        // Find the bundle in order items
        const itemIndex = order.items.findIndex(
          (item) =>
            item.type === "bundle" && item.bundle._id.toString() === bundleId,
        );

        if (itemIndex === -1) {
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                null,
                `Bundle ${bundleId} not found in order. Use 'addBundles' array to add new bundles.`,
                false,
              ),
            );
        }

        if (quantity === 0) {
          // Remove item from order
          order.items.splice(itemIndex, 1);
        } else {
          // Update quantity
          const bundle = await Bundle.findById(bundleId);
          if (!bundle) {
            return res
              .status(400)
              .json(
                new ApiResponse(
                  400,
                  null,
                  `Bundle ${bundleId} not found`,
                  false,
                ),
              );
          }

          const price = parseFloat(bundle.price.toString());
          const discountedPrice = bundle.discounted_price
            ? parseFloat(bundle.discounted_price.toString())
            : price;
          const itemTotal = price * quantity;
          const discountedItemTotal = discountedPrice * quantity;

          order.items[itemIndex].quantity = quantity;
          order.items[itemIndex].total_amount =
            mongoose.Types.Decimal128.fromString(itemTotal.toString());
          order.items[itemIndex].discounted_total_amount =
            mongoose.Types.Decimal128.fromString(
              discountedItemTotal.toString(),
            );
        }
      }
    }

    // Recalculate totals after item updates
    if (
      updateData.products ||
      updateData.bundles ||
      updateData.addProducts ||
      updateData.addBundles
    ) {
      let totalAmount = 0;
      let discountedTotalAmount = 0;

      order.items.forEach((item) => {
        totalAmount += parseFloat(item.total_amount.toString());
        discountedTotalAmount += parseFloat(
          item.discounted_total_amount.toString(),
        );
      });

      order.totalAmount = mongoose.Types.Decimal128.fromString(
        totalAmount.toString(),
      );
      order.discountedTotalAmount = mongoose.Types.Decimal128.fromString(
        discountedTotalAmount.toString(),
      );
    }

    // Handle shipping updates with three options:
    // 1. Manual override (updateData.shippingCost)
    // 2. Recalculate by specific delivery zone (updateData.deliveryZoneId)
    // 3. Auto-recalculate if address or items changed

    let shippingUpdated = false;
    let newShippingCost = 0;
    let newShippingDetails = null;

    // Option 1: Manual shipping cost override
    if (updateData.shippingCost !== undefined) {
      newShippingCost = parseFloat(updateData.shippingCost);

      if (newShippingCost < 0) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Shipping cost cannot be negative",
              false,
            ),
          );
      }

      // Keep existing shipping details but mark as manual override
      newShippingDetails = order.shippingDetails || {
        deliveryZoneId: null,
        zoneName: "Manual Override",
        pricingType: "manual",
        isManual: true,
        calculatedAt: new Date(),
      };
      newShippingDetails.isManual = true;
      newShippingDetails.calculatedAt = new Date();
      shippingUpdated = true;
    }
    // Option 2: Recalculate by specific delivery zone
    else if (updateData.deliveryZoneId) {
      let totalWeightGrams = 0;

      // Calculate total weight from current order items
      for (const item of order.items) {
        if (item.type === "product" && item.product) {
          const product = await Product.findById(item.product._id);
          if (product && product.weight_in_grams) {
            totalWeightGrams += product.weight_in_grams * item.quantity;
          }
        } else if (item.type === "bundle" && item.bundle) {
          const bundle = await Bundle.findById(item.bundle._id);
          if (bundle && bundle.products && Array.isArray(bundle.products)) {
            for (const bundleProduct of bundle.products) {
              const product = await Product.findById(bundleProduct.product);
              if (product && product.weight_in_grams) {
                totalWeightGrams +=
                  product.weight_in_grams *
                  bundleProduct.quantity *
                  item.quantity;
              }
            }
          }
        }
      }

      const result = await calculateShippingByZone(
        updateData.deliveryZoneId,
        totalWeightGrams,
      );

      if (result.shippingDetails) {
        newShippingCost = result.shippingCost;
        newShippingDetails = result.shippingDetails;
        shippingUpdated = true;
      } else {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Invalid or inactive delivery zone",
              false,
            ),
          );
      }
    }
    // Option 3: Auto-recalculate if address or items changed
    else if (
      updateData.addressId ||
      updateData.products ||
      updateData.bundles ||
      updateData.addProducts ||
      updateData.addBundles
    ) {
      // Orders under ₹2000 incur a flat ₹50 shipping charge
      const discountedTotal = parseFloat(order.discountedTotalAmount.toString());
      const result = await calculateShippingCost(discountedTotal);

      newShippingCost = result.shippingCost;
      newShippingDetails = result.shippingDetails;
      shippingUpdated = true;
    }

    // Update shipping if any of the above conditions triggered
    if (shippingUpdated) {
      order.shippingCost = newShippingCost;
      order.shippingDetails = newShippingDetails;

      // Recalculate final total
      const discountedTotal = parseFloat(
        order.discountedTotalAmount.toString(),
      );
      order.finalTotalAmount = mongoose.Types.Decimal128.fromString(
        (discountedTotal + newShippingCost).toString(),
      );
    }

    // Update other fields if provided
    if (updateData.notes) {
      order.notes = updateData.notes;
    }
    if (updateData.utr_number !== undefined) {
      order.utr_number = updateData.utr_number;
    }
    if (updateData.refundAmount !== undefined) {
      order.refundAmount = parseFloat(updateData.refundAmount);
    }
    if (updateData.refundMode !== undefined) {
      order.refundMode = updateData.refundMode;
    }
    if (
      updateData.refundTransactionId !== undefined ||
      updateData.transactionId !== undefined ||
      updateData.utrNo !== undefined
    ) {
      order.refundTransactionId =
        updateData.refundTransactionId ||
        updateData.transactionId ||
        updateData.utrNo;
    }
    if (updateData.refundTo !== undefined || updateData.destination !== undefined) {
      order.refundTo = updateData.refundTo || updateData.destination;
    }
    if (updateData.refundReason !== undefined || updateData.reason !== undefined) {
      order.refundReason = updateData.refundReason || updateData.reason;
    }
    if (updateData.refundStatus !== undefined) {
      order.refundStatus = updateData.refundStatus;
    }
    if (updateData.refundedAt !== undefined) {
      order.refundedAt = updateData.refundedAt;
    }
    if (updateData.codPaymentMethod || updateData.paymentMethod) {
      const selected = updateData.codPaymentMethod || updateData.paymentMethod;
      const normCod =
        String(selected).toLowerCase().includes("upi") ? "upi" : "cash";
      order.codPaymentMethod = normCod;
      order.paymentMethod = normCod;
      order.paymentStatus = "paid";
      order.paidAt = order.paidAt || new Date();
    }

    await order.save();

    // Generate the invoice the first time an order is confirmed (no-op if
    // it already exists).
    if (order.status === "confirmed") {
      try {
        await ensureOrderBillGenerated(order);
      } catch (error) {
        console.error(`Bill generation failed for order ${order._id}:`, error.message);
      }
    }

    (async () => {
      try {
        // Send customer email
        const user = await User.findById(order.user);
        const customerHtmlContent = generateCustomerOrderUpdate(
          order.toObject(),
          user.toObject(),
        );

        const customerEmailOptions = {
          to: user.email,
          subject: `Order Updated - ${order._id}`,
          html: customerHtmlContent,
        };

        const customerEmailSent = await sendEmail(customerEmailOptions);

        if (customerEmailSent.success) {
          console.log("✅ Order updated email sent successfully to customer");
          // Update email tracking status
          order.emailTracking.confirmation.status = "sent";
          order.emailTracking.confirmation.sentAt = new Date();
          await order.save();
        }

        // Send admin email
        const admins = await Admin.find({
          role: { $in: ["super_admin", "admin"] },
        }).select("email");

        const adminEmails = admins.map((admin) => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const adminHtmlContent = generateCompanyOrderUpdate(
            order.toObject(),
            user.toObject(),
          );
          const adminEmailOptions = {
            to: adminEmails[0], // Send to first admin (Brevo API handles single recipient)
            subject: `🛒 Order Updated - Order #${order._id}`,
            html: adminHtmlContent,
          };

          const adminEmailSent = await sendEmail(adminEmailOptions);

          if (adminEmailSent.success) {
            console.log(
              "✅ Order updated notification sent successfully to admin",
            );
          } else {
            console.error(
              "❌ Failed to send order updated notification to admin",
            );
          }
        }
      } catch (error) {
        console.error("❌ Failed to send order updated email:", error.message);
        // Update email tracking status
        order.emailTracking.confirmation.status = "failed";
        order.emailTracking.confirmation.failedAt = new Date();
        order.emailTracking.confirmation.error = error.message;
        await order.save();
      }
    })();

    return res
      .status(200)
      .json(new ApiResponse(200, order, "Order updated successfully", true));
  } catch (error) {
    console.error("Error updating order:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Error updating order", false));
  }
});

const getOrdersByProductId = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { status } = req.query;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid product ID", false));
  }

  try {
    // Build the base query
    const baseOr = [
      {
        "items.type": "product",
        "items.product._id": new mongoose.Types.ObjectId(productId),
      },
      {
        "items.type": "bundle",
        "items.bundle.products.product": new mongoose.Types.ObjectId(productId),
      },
    ];

    // If status is provided, add it to the query
    const query = status
      ? { $and: [{ $or: baseOr }, { status }] }
      : { $or: baseOr };

    // Find orders that contain this product either directly or in bundles
    const orders = await Order.find(query);

    let totalOrders = 0;
    let totalQuantity = 0;
    let totalRevenue = 0;
    let totalDiscountedRevenue = 0;
    let product = null;
    const relevantOrders = [];

    // Calculate stats and get product info
    orders.forEach((order) => {
      let orderContainsProduct = false;
      let orderQuantity = 0;
      let orderRevenue = 0;
      let orderDiscountedRevenue = 0;

      order.items.forEach((item) => {
        if (
          item.type === "product" &&
          item.product &&
          item.product._id &&
          item.product._id.toString() === productId
        ) {
          // Direct product order
          orderContainsProduct = true;
          orderQuantity += item.quantity || 0;

          // Safe parsing with null checks
          const totalAmount = item.total_amount
            ? parseFloat(item.total_amount.toString())
            : 0;
          const discountedTotalAmount = item.discounted_total_amount
            ? parseFloat(item.discounted_total_amount.toString())
            : 0;

          // If discounted_total_amount is 0 or null, calculate it from the product's discounted price
          let finalDiscountedAmount = discountedTotalAmount;
          if (discountedTotalAmount === 0 && item.product.discounted_price) {
            const productDiscountedPrice = parseFloat(
              item.product.discounted_price.toString(),
            );
            const productQuantity = item.quantity || 0;
            finalDiscountedAmount = productDiscountedPrice * productQuantity;
          }

          orderRevenue += totalAmount;
          orderDiscountedRevenue += finalDiscountedAmount;

          if (!product) {
            // Convert Decimal128 fields to numbers for product details
            product = {
              _id: item.product._id,
              name: item.product.name,
              sku: item.product.sku,
              price: item.product.price
                ? parseFloat(item.product.price.toString())
                : null,
              discounted_price: item.product.discounted_price
                ? parseFloat(item.product.discounted_price.toString())
                : null,
              banner_image: item.product.banner_image || (item.product.images && item.product.images[0]) || null,
              image: item.product.image || item.product.banner_image || (item.product.images && item.product.images[0]) || null,
              images: item.product.images || [],
            };
          }
        } else if (
          item.type === "bundle" &&
          item.bundle &&
          item.bundle.products
        ) {
          // Check if this bundle contains the product
          const bundleProduct = item.bundle.products.find(
            (bp) => bp.product && bp.product.toString() === productId,
          );
          if (bundleProduct) {
            orderContainsProduct = true;
            // Calculate quantity: bundle quantity * product quantity in bundle
            orderQuantity +=
              (item.quantity || 0) * (bundleProduct.quantity || 0);

            // Distribute bundle revenue proportionally
            const bundleRevenue = item.total_amount
              ? parseFloat(item.total_amount.toString())
              : 0;
            const bundleDiscountedRevenue = item.discounted_total_amount
              ? parseFloat(item.discounted_total_amount.toString())
              : 0;
            const productCount = item.bundle.products.length;

            orderRevenue += bundleRevenue / productCount;
            orderDiscountedRevenue += bundleDiscountedRevenue / productCount;

            if (!product) {
              // We'll fetch the actual product details
              product = { _id: productId };
            }
          }
        }
      });

      if (orderContainsProduct) {
        totalOrders += 1;
        totalQuantity += orderQuantity;
        totalRevenue += orderRevenue;
        totalDiscountedRevenue += orderDiscountedRevenue;
        relevantOrders.push(order);
      }
    });

    // Fetch actual product details if not already available
    if (!product || !product.name) {
      const productDetails = await Product.findById(productId);
      if (productDetails) {
        product = {
          _id: productDetails._id,
          name: productDetails.name,
          sku: productDetails.sku,
          price: productDetails.price
            ? parseFloat(productDetails.price.toString())
            : null,
          discounted_price: productDetails.discounted_price
            ? parseFloat(productDetails.discounted_price.toString())
            : null,
          banner_image: productDetails.banner_image || (productDetails.images && productDetails.images[0]) || null,
          image: (productDetails.images && productDetails.images[0]) || productDetails.banner_image || null,
          images: productDetails.images || [],
        };
      }
    }

    const result = {
      product,
      totalOrders,
      totalQuantity,
      totalRevenue,
      totalDiscountedRevenue,
      orders: relevantOrders,
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Orders by product ID fetched successfully",
          true,
        ),
      );
  } catch (error) {
    console.error("Error fetching orders by product ID:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Server error", false));
  }
});

/**
 * Get email tracking status for an order (for customer support)
 */
const getOrderEmailStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id).select(
    "_id emailTracking createdAt status",
  );

  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  // Build email status summary
  const emailStatus = {
    orderId: order._id,
    orderStatus: order.status,
    orderDate: order.createdAt,
    confirmation: {
      status: order.emailTracking?.confirmation?.status || "queued",
      queuedAt: order.emailTracking?.confirmation?.queuedAt || null,
      sentAt: order.emailTracking?.confirmation?.sentAt || null,
      deliveredAt: order.emailTracking?.confirmation?.deliveredAt || null,
      bouncedAt: order.emailTracking?.confirmation?.bouncedAt || null,
      failedAt: order.emailTracking?.confirmation?.failedAt || null,
      opened: order.emailTracking?.confirmation?.opened || false,
      openedAt: order.emailTracking?.confirmation?.openedAt || null,
      openCount: order.emailTracking?.confirmation?.openCount || 0,
      clicked: order.emailTracking?.confirmation?.clicked || false,
      clickedAt: order.emailTracking?.confirmation?.clickedAt || null,
      clickCount: order.emailTracking?.confirmation?.clickCount || 0,
      attempts: order.emailTracking?.confirmation?.attempts || 0,
      lastAttempt: order.emailTracking?.confirmation?.lastAttemptAt || null,
      error: order.emailTracking?.confirmation?.error || null,
    },
    statusUpdates: order.emailTracking?.statusUpdates || [],
    summary: {
      totalEmailsSent:
        (order.emailTracking?.confirmation?.status === "sent" ? 1 : 0) +
        (order.emailTracking?.statusUpdates?.filter(
          (s) => s.emailStatus === "sent",
        ).length || 0),
      totalEmailsFailed:
        (order.emailTracking?.confirmation?.status === "failed" ? 1 : 0) +
        (order.emailTracking?.statusUpdates?.filter(
          (s) => s.emailStatus === "failed",
        ).length || 0),
      totalEmailsOpened:
        (order.emailTracking?.confirmation?.opened ? 1 : 0) +
        (order.emailTracking?.statusUpdates?.filter((s) => s.opened).length ||
          0),
      totalEmailsClicked:
        (order.emailTracking?.confirmation?.clicked ? 1 : 0) +
        (order.emailTracking?.statusUpdates?.filter((s) => s.clicked).length ||
          0),
      lastEmailSent: getLastEmailSent(order.emailTracking),
    },
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        emailStatus,
        "Email status retrieved successfully",
        true,
      ),
    );
});

/**
 * Helper function to get last email sent date
 */
function getLastEmailSent(emailTracking) {
  const dates = [];

  if (emailTracking?.confirmation?.sentAt) {
    dates.push(new Date(emailTracking.confirmation.sentAt));
  }

  if (emailTracking?.statusUpdates) {
    emailTracking.statusUpdates.forEach((update) => {
      if (update.sentAt) {
        dates.push(new Date(update.sentAt));
      }
    });
  }

  return dates.length > 0 ? new Date(Math.max(...dates)) : null;
}

const generatePaymentLinks = asyncHandler(async (req, res) => {
  const { orderId, amount } = req.body;

  // Validate input
  if (!orderId || !amount) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Order ID and amount are required", false),
      );
  }

  // Validate orderId format
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID format", false));
  }

  // Validate amount
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Amount must be a positive number", false),
      );
  }

  try {
    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, "Order not found", false));
    }

    // // Check if payment link already exists
    // if (order.paymentLink) {
    //   return res
    //     .status(400)
    //     .json(new ApiResponse(400, null, "Payment link already exists for this order", false));
    // }

    // Convert amount to paise (Razorpay expects amount in smallest currency unit)
    const amountInPaise = Math.round(numericAmount * 100);

    // Resolve customer email for payment link
    let customerEmail = "";
    if (order.user) {
      const orderUser = await User.findById(order.user).select("email");
      if (orderUser) customerEmail = orderUser.email || "";
    } else if (order.guestInfo?.email) {
      customerEmail = order.guestInfo.email;
    } else if (order.address?.email) {
      customerEmail = order.address.email;
    }

    // Create payment link using Razorpay
    const paymentLinkOptions = {
      amount: amountInPaise,
      currency: "INR",
      description: `Payment for Order #${orderId}`,
      customer: {
        name: order.address?.name || "Customer",
        contact: order.address?.mobile || "",
        email: customerEmail,
      },
      notify: {
        sms: true,
        email: !!customerEmail,
      },
      reminder_enable: true,
    };

    const paymentLink = await razorpay.paymentLink.create(paymentLinkOptions);

    // Update order with payment link information
    order.paymentLink = paymentLink.short_url;
    order.paymentLinkId = paymentLink.id;
    await order.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          paymentLink: paymentLink.short_url,
          paymentLinkId: paymentLink.id,
          orderId: order._id,
          amount: numericAmount,
        },
        "Payment link generated successfully",
        true,
      ),
    );
  } catch (error) {
    console.error("Error generating payment link:", error);

    // Handle specific Razorpay errors
    if (error.error) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Payment link creation failed: ${error.error.description || error.error.message}`,
            false,
          ),
        );
    }

    return res
      .status(500)
      .json(
        new ApiResponse(500, null, "Failed to generate payment link", false),
      );
  }
});

const handlePaymentWebhook = asyncHandler(async (req, res) => {
  const crypto = require("crypto");

  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    if (!signature) {
      console.error("Missing x-razorpay-signature header");
      return res.status(400).json({ error: "Missing signature header" });
    }

    // Verify webhook signature using raw body buffer if available, fallback to JSON.stringify
    const rawPayload = req.rawBody ? req.rawBody : JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawPayload)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Webhook signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body;
    const eventType = event?.event;
    console.log("Received Razorpay webhook event:", eventType);

    // Handle payment captured / order paid / payment_link.paid events
    if (
      eventType === "payment.captured" ||
      eventType === "order.paid" ||
      eventType === "payment_link.paid"
    ) {
      const payment = event.payload?.payment?.entity;
      const paymentLink = event.payload?.payment_link?.entity;
      const rzpOrderEntity = event.payload?.order?.entity;

      let order = null;

      if (paymentLink?.id) {
        order = await Order.findOne({ paymentLinkId: paymentLink.id });
      }

      if (!order && payment?.order_id) {
        order = await Order.findOne({ razorpayOrderId: payment.order_id });
      }

      if (!order && rzpOrderEntity?.id) {
        order = await Order.findOne({ razorpayOrderId: rzpOrderEntity.id });
      }

      if (
        !order &&
        payment?.notes?.orderId &&
        mongoose.Types.ObjectId.isValid(payment.notes.orderId)
      ) {
        order = await Order.findById(payment.notes.orderId);
      }

      if (
        !order &&
        rzpOrderEntity?.notes?.orderId &&
        mongoose.Types.ObjectId.isValid(rzpOrderEntity.notes.orderId)
      ) {
        order = await Order.findById(rzpOrderEntity.notes.orderId);
      }

      if (order) {
        const orderAmountInPaise = Math.round(
          parseFloat(order.finalTotalAmount.toString()) * 100,
        );
        const paidAmount =
          payment?.amount || rzpOrderEntity?.amount_paid || orderAmountInPaise;

        if (paidAmount === orderAmountInPaise) {
          order.paymentStatus = "paid";
          if (payment) {
            order.paymentId = payment.id;
            order.paymentMethod = payment.method || order.paymentMethod;
          }
          if (payment?.order_id) {
            order.razorpayOrderId = payment.order_id;
          }
          order.paymentMode = "ONLINE";
          order.paidAt = new Date();

          if (order.status === "pending") {
            order.status = "confirmed";
          }

          await order.save();

          try {
            await ensureOrderBillGenerated(order);
          } catch (billError) {
            console.error(
              `Bill generation failed for order ${order._id}:`,
              billError.message,
            );
          }

          console.log(`Payment confirmed via webhook for order ${order._id}`);
        } else {
          console.error(
            `Payment amount mismatch for order ${order._id}. Expected: ${orderAmountInPaise}, Received: ${paidAmount}`,
          );
        }
      } else {
        // Fallback: If verifyRazorpayPayment was not reached by frontend (e.g. app crashed after payment),
        // try to create the order from Razorpay order notes if cartId, addressId, userId are present.
        const notes = payment?.notes || rzpOrderEntity?.notes;
        const paymentId = payment?.id;
        if (notes?.cartId && notes?.addressId && notes?.userId && paymentId) {
          try {
            let existing = await Order.findOne({ paymentId });
            if (!existing) {
              const summary = await prepareCartOrderData({
                userId: notes.userId,
                cartId: notes.cartId,
                addressId: notes.addressId,
                couponCode: notes.couponCode || null,
                selectedItemIds: notes.selectedItemIds ? notes.selectedItemIds.split(",").filter(Boolean) : null,
              });

              const newOrder = new Order({
                user: notes.userId,
                items: summary.orderItems,
                address: summary.addressSnapshot,
                totalAmount: summary.totalAmount,
                discountedTotalAmount: summary.discountedTotalAmount,
                shippingCost: summary.shippingCost,
                shippingDetails: summary.shippingDetails,
                coupon: summary.couponResult ? summary.couponResult.coupon._id : null,
                couponCode: summary.couponResult ? summary.couponResult.coupon.code : null,
                couponDiscountAmount: summary.couponDiscountAmount,
                finalTotalAmount: summary.finalTotalAmount,
                paymentMode: "ONLINE",
                paymentStatus: "paid",
                paymentId: paymentId,
                razorpayOrderId: payment?.order_id || rzpOrderEntity?.id,
                paymentMethod: payment?.method || null,
                status: "confirmed",
                paidAt: new Date(),
              });
              await newOrder.save();

              if (summary.couponResult) {
                CouponService.applyCouponUsage({
                  couponId: summary.couponResult.coupon._id,
                  userId: notes.userId,
                  orderId: newOrder._id,
                  discountAmount: summary.couponDiscountAmount,
                  orderTotal: summary.discountedTotalAmount,
                }).catch((e) => console.error("Webhook coupon usage failed:", e.message));
              }

              InventoryService.deductForOrder(newOrder).catch((e) =>
                console.error("Webhook inventory deduction failed:", e.message)
              );

              const orderedIdsSet = new Set(summary.processedCartItemIds);
              summary.cart.items = summary.cart.items.filter((ci) => !orderedIdsSet.has(ci._id ? ci._id.toString() : ""));
              await summary.cart.save();

              try {
                await ensureOrderBillGenerated(newOrder);
              } catch (billError) {
                console.error(`Bill generation failed for order ${newOrder._id}:`, billError.message);
              }

              const userObj = await User.findById(notes.userId);
              if (userObj) {
                await sendOrderNotificationEmailsAsync(newOrder, userObj);
              }

              console.log(`✅ Order ${newOrder._id} created via webhook fallback for payment ${paymentId}`);
            }
          } catch (webhookCreateErr) {
            console.error("Failed to auto-create order from webhook notes:", webhookCreateErr.message);
          }
        } else {
          console.error(
            `Order not found for webhook event ${eventType}. Payment ID: ${payment?.id}, Razorpay Order ID: ${payment?.order_id || rzpOrderEntity?.id}`,
          );
        }
      }
    }

    // Handle payment failed event
    if (eventType === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      const paymentLink = event.payload?.payment_link?.entity;

      let order = null;
      if (paymentLink?.id) {
        order = await Order.findOne({ paymentLinkId: paymentLink.id });
      }
      if (!order && payment?.order_id) {
        order = await Order.findOne({ razorpayOrderId: payment.order_id });
      }
      if (
        !order &&
        payment?.notes?.orderId &&
        mongoose.Types.ObjectId.isValid(payment.notes.orderId)
      ) {
        order = await Order.findById(payment.notes.orderId);
      }

      if (order && order.paymentStatus !== "paid") {
        order.paymentStatus = "failed";
        await order.save();
        console.log(
          `Payment marked failed for order ${order._id}, payment ID: ${payment?.id}`,
        );
      }
    }

    // Handle refund events
    if (
      eventType === "refund.processed" ||
      eventType === "refund.created" ||
      eventType === "payment.refunded"
    ) {
      const refund = event.payload?.refund?.entity;
      const payment = event.payload?.payment?.entity;

      let order = null;
      if (refund?.payment_id) {
        order = await Order.findOne({ paymentId: refund.payment_id });
      }
      if (!order && payment?.id) {
        order = await Order.findOne({ paymentId: payment.id });
      }
      if (!order && payment?.order_id) {
        order = await Order.findOne({ razorpayOrderId: payment.order_id });
      }
      if (
        !order &&
        refund?.notes?.orderId &&
        mongoose.Types.ObjectId.isValid(refund.notes.orderId)
      ) {
        order = await Order.findById(refund.notes.orderId);
      }

      if (order) {
        const previousStatus = order.status;
        const refundAmt = refund?.amount
          ? refund.amount / 100
          : (order.finalTotalAmount || 0);
        order.refundId = refund?.id || order.refundId;
        order.refundAmount = refundAmt;
        order.refundMode = order.refundMode || "razorpay";
        order.refundTransactionId = order.refundTransactionId || refund?.id || null;
        order.refundTo = order.refundTo || "Original Payment Method (Razorpay)";
        order.refundStatus = "processed";
        order.refundedAt = new Date();
        order.paymentStatus = "refunded";
        order.status = "refunded";
        await order.save();

        const user = await User.findById(order.user);
        if (user && user.email) {
          setImmediate(async () => {
            try {
              await sendStatusUpdateEmails({
                order: order.toObject(),
                user: user.toObject(),
                previousStatus,
              });
            } catch (emailErr) {
              console.error(
                "❌ Failed to send webhook refund email:",
                emailErr.message,
              );
            }
          });
        }

        InventoryService.restoreForCancelledOrder(order).catch((err) =>
          console.error(
            `Inventory restore failed for refunded order ${order._id}:`,
            err.message,
          ),
        );
        CouponService.releaseCouponUsage(order._id).catch((err) =>
          console.error(
            `Coupon release failed for refunded order ${order._id}:`,
            err.message,
          ),
        );

        console.log(`Order ${order._id} marked as refunded via webhook`);
      }
    }

    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

const createRazorpayOrder = asyncHandler(async (req, res) => {
  const { orderId, cartId, addressId, couponCode, selectedItemIds } = req.body;

  // Case A: Pre-existing order ID passed (backward compatibility / retry payment flow)
  if (orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid order ID format", false));
    }

    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Order not found", false));
      }

      // Security check: if order belongs to a registered user, caller MUST be that user
      if (order.user) {
        if (!req.user || order.user.toString() !== req.user._id.toString()) {
          return res
            .status(403)
            .json(
              new ApiResponse(
                403,
                null,
                "Unauthorized access to this order",
                false,
              ),
            );
        }
      }

      if (order.status === "cancelled") {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Cannot create payment for a cancelled order",
              false,
            ),
          );
      }

      if (order.paymentStatus === "paid") {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Order has already been paid", false));
      }

      // Validate live inventory for all items in existing order
      const outOfStockItems = [];
      for (const item of order.items || []) {
        if (item.type === "product" && item.product?._id) {
          const stockCheck = await checkProductStock(
            item.product._id,
            item.variant_sku,
            item.quantity || 1
          );
          if (!stockCheck.isAvailable) {
            outOfStockItems.push({
              productId: stockCheck.productId,
              variantId: stockCheck.variantId,
              productName: stockCheck.productName,
              requestedQuantity: item.quantity || 1,
              availableStock: stockCheck.availableStock,
            });
          }
        } else if (item.type === "bundle" && item.bundle?.products) {
          for (const bComp of item.bundle.products) {
            const reqCompQty = (bComp.quantity || 1) * (item.quantity || 1);
            const compCheck = await checkProductStock(
              bComp.product,
              bComp.variant_sku,
              reqCompQty
            );
            if (!compCheck.isAvailable) {
              outOfStockItems.push({
                productId: compCheck.productId,
                variantId: compCheck.variantId,
                productName: `${item.bundle.name} - ${compCheck.productName}`,
                requestedQuantity: reqCompQty,
                availableStock: compCheck.availableStock,
              });
            }
          }
        }
      }

      if (outOfStockItems.length > 0) {
        const firstItemName = outOfStockItems[0].productName;
        return res.status(400).json({
          success: false,
          message: `Item "${firstItemName}" is currently out of stock or requested quantity is unavailable.`,
          outOfStockItems,
        });
      }

      // Convert amount to paise
      const amountInPaise = Math.round(
        parseFloat(order.finalTotalAmount.toString()) * 100,
      );

      if (isNaN(amountInPaise) || amountInPaise <= 0) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid order total amount", false));
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      if (!keyId) {
        return res
          .status(500)
          .json(
            new ApiResponse(
              500,
              null,
              "Razorpay key is not configured on server",
              false,
            ),
          );
      }

      // Resolve customer email
      let customerEmail =
        req.user?.email || order.guestInfo?.email || order.address?.email || "";
      if (!customerEmail && order.user) {
        const orderUser = await User.findById(order.user).select("email");
        if (orderUser) customerEmail = orderUser.email || "";
      }

      const rzpOrderOptions = {
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${order._id.toString().slice(-20)}`,
        notes: {
          orderId: order._id.toString(),
          userId: req.user?._id ? req.user._id.toString() : "guest",
        },
      };

      const rzpOrder = await razorpay.orders.create(rzpOrderOptions);

      order.razorpayOrderId = rzpOrder.id;
      order.paymentMode = "ONLINE";
      await order.save();

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            orderId: order._id,
            razorpayOrderId: rzpOrder.id,
            amount: rzpOrder.amount, // in paise
            currency: rzpOrder.currency,
            keyId: keyId,
            customer: {
              name: order.address?.name || "",
              contact: order.address?.mobile || "",
              email: customerEmail,
            },
          },
          "Razorpay order created successfully",
          true,
        ),
      );
    } catch (error) {
      if (error.outOfStockItems && Array.isArray(error.outOfStockItems)) {
        return res.status(400).json({
          success: false,
          message: error.message,
          outOfStockItems: error.outOfStockItems,
        });
      }
      console.error("Error creating Razorpay order:", error);
      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            `Failed to create Razorpay order: ${error.message}`,
            false,
          ),
        );
    }
  }

  // Case B: Option 1 Flow - Create Razorpay order directly from cart & address (no DB order created!)
  if (cartId && addressId) {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Authentication required to checkout cart", false));
    }

    try {
      const summary = await prepareCartOrderData({
        userId,
        cartId,
        addressId,
        couponCode,
        selectedItemIds,
      });

      const amountInPaise = Math.round(
        parseFloat(summary.finalTotalAmount.toString()) * 100,
      );

      if (isNaN(amountInPaise) || amountInPaise <= 0) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid calculated order total amount", false));
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      if (!keyId) {
        return res
          .status(500)
          .json(
            new ApiResponse(
              500,
              null,
              "Razorpay key is not configured on server",
              false,
            ),
          );
      }

      const customerEmail = req.user?.email || summary.address?.email || "";

      const rzpOrderOptions = {
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${summary.cart._id.toString().slice(-14)}_${Date.now().toString().slice(-6)}`,
        notes: {
          userId: userId.toString(),
          cartId: cartId.toString(),
          addressId: addressId.toString(),
          couponCode: couponCode || "",
          selectedItemIds: Array.isArray(selectedItemIds) ? selectedItemIds.join(",") : "",
        },
      };

      const rzpOrder = await razorpay.orders.create(rzpOrderOptions);

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            orderId: null, // Note: No database order created yet!
            razorpayOrderId: rzpOrder.id,
            amount: rzpOrder.amount, // in paise
            currency: rzpOrder.currency,
            keyId: keyId,
            finalTotalAmount: summary.finalTotalAmount,
            customer: {
              name: summary.address?.name || "",
              contact: summary.address?.mobile || "",
              email: customerEmail,
            },
          },
          "Razorpay checkout order created successfully (no order placed yet)",
          true,
        ),
      );
    } catch (error) {
      if (error.outOfStockItems && Array.isArray(error.outOfStockItems)) {
        return res.status(400).json({
          success: false,
          message: error.message,
          outOfStockItems: error.outOfStockItems,
        });
      }
      console.error("Error creating Razorpay order from cart:", error);
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Failed to initiate payment: ${error.message}`,
            false,
          ),
        );
    }
  }

  return res
    .status(400)
    .json(
      new ApiResponse(
        400,
        null,
        "Either 'orderId' or ('cartId' and 'addressId') is required",
        false,
      ),
    );
});

const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const crypto = require("crypto");
  const {
    orderId,
    cartId,
    addressId,
    couponCode,
    selectedItemIds,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature
  ) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required",
          false,
        ),
      );
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          "Razorpay secret is not configured on server",
          false,
        ),
      );
  }

  // 1. Verify HMAC-SHA256 signature
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    console.error(
      `Razorpay signature verification failed. Expected: ${expectedSignature}, Received: ${razorpay_signature}`,
    );
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid payment signature", false));
  }

  // 2. Fetch payment details from Razorpay to get payment method & verify status
  let paymentMethod = null;
  try {
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
    paymentMethod = paymentDetails?.method || null;
  } catch (err) {
    console.error("Could not fetch payment method from Razorpay:", err.message);
  }

  // Case A: Existing order verification (when orderId is supplied)
  if (orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Invalid order ID format", false));
    }

    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return res
          .status(404)
          .json(new ApiResponse(404, null, "Order not found", false));
      }

      if (order.user) {
        if (!req.user || order.user.toString() !== req.user._id.toString()) {
          return res
            .status(403)
            .json(
              new ApiResponse(
                403,
                null,
                "Unauthorized access to this order",
                false,
              ),
            );
        }
      }

      if (order.paymentStatus === "paid") {
        return res.status(200).json(
          new ApiResponse(
            200,
            order,
            "Payment already verified and order confirmed",
            true,
          ),
        );
      }

      // Live stock check before confirming order
      const outOfStockItems = [];
      for (const item of order.items || []) {
        if (item.type === "product" && item.product?._id) {
          const stockCheck = await checkProductStock(
            item.product._id,
            item.variant_sku,
            item.quantity || 1
          );
          if (!stockCheck.isAvailable) {
            outOfStockItems.push({
              productId: stockCheck.productId,
              variantId: stockCheck.variantId,
              productName: stockCheck.productName,
              requestedQuantity: item.quantity || 1,
              availableStock: stockCheck.availableStock,
            });
          }
        } else if (item.type === "bundle" && item.bundle?.products) {
          for (const bComp of item.bundle.products) {
            const reqCompQty = (bComp.quantity || 1) * (item.quantity || 1);
            const compCheck = await checkProductStock(
              bComp.product,
              bComp.variant_sku,
              reqCompQty
            );
            if (!compCheck.isAvailable) {
              outOfStockItems.push({
                productId: compCheck.productId,
                variantId: compCheck.variantId,
                productName: `${item.bundle.name} - ${compCheck.productName}`,
                requestedQuantity: reqCompQty,
                availableStock: compCheck.availableStock,
              });
            }
          }
        }
      }

      if (outOfStockItems.length > 0) {
        const firstItemName = outOfStockItems[0].productName;
        return res.status(400).json({
          success: false,
          message: `Item "${firstItemName}" is currently out of stock or requested quantity is unavailable.`,
          outOfStockItems,
        });
      }

      order.paymentStatus = "paid";
      order.paymentId = razorpay_payment_id;
      order.razorpayOrderId = razorpay_order_id;
      order.razorpaySignature = razorpay_signature;
      order.paymentMode = "ONLINE";
      if (paymentMethod) {
        order.paymentMethod = paymentMethod;
      }
      order.paidAt = new Date();

      if (order.status === "pending") {
        order.status = "confirmed";
      }

      await order.save();

      // Deduct inventory atomically
      try {
        await InventoryService.deductForOrder(order);
      } catch (deductErr) {
        console.error(`Inventory deduction failed for order ${order._id}:`, deductErr.message);
      }

      try {
        await ensureOrderBillGenerated(order);
      } catch (billError) {
        console.error(
          `Bill generation failed for order ${order._id}:`,
          billError.message,
        );
      }

      return res.status(200).json(
        new ApiResponse(
          200,
          order,
          "Payment verified and order confirmed successfully",
          true,
        ),
      );
    } catch (error) {
      if (error.outOfStockItems && Array.isArray(error.outOfStockItems)) {
        return res.status(400).json({
          success: false,
          message: error.message,
          outOfStockItems: error.outOfStockItems,
        });
      }
      console.error("Error verifying payment for existing order:", error);
      return res
        .status(500)
        .json(
          new ApiResponse(
            500,
            null,
            `Failed to verify payment: ${error.message}`,
            false,
          ),
        );
    }
  }

  // Case B: Option 1 Flow - Create order in DB ONLY NOW after verified payment!
  try {
    // Idempotency check: see if an order was already created with this payment ID
    let existingOrder = await Order.findOne({ paymentId: razorpay_payment_id });
    if (existingOrder) {
      return res.status(200).json(
        new ApiResponse(
          200,
          existingOrder,
          "Payment already verified and order confirmed",
          true,
        ),
      );
    }

    // Resolve cartId, addressId, couponCode, selectedItemIds (from body or Razorpay order notes)
    let cId = cartId;
    let aId = addressId;
    let cCode = couponCode;
    let selItemIds = selectedItemIds;
    let uid = req.user?._id;

    if (!cId || !aId) {
      try {
        const rzpOrderDetails = await razorpay.orders.fetch(razorpay_order_id);
        if (rzpOrderDetails?.notes) {
          cId = cId || rzpOrderDetails.notes.cartId;
          aId = aId || rzpOrderDetails.notes.addressId;
          cCode = cCode || rzpOrderDetails.notes.couponCode;
          if (!selItemIds && rzpOrderDetails.notes.selectedItemIds) {
            selItemIds = rzpOrderDetails.notes.selectedItemIds.split(",").filter(Boolean);
          }
          if (!uid && rzpOrderDetails.notes.userId && rzpOrderDetails.notes.userId !== "guest") {
            uid = rzpOrderDetails.notes.userId;
          }
        }
      } catch (fetchErr) {
        console.error("Could not fetch Razorpay order notes:", fetchErr.message);
      }
    }

    if (!cId || !aId) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "cartId and addressId are required to complete order creation",
            false,
          ),
        );
    }

    if (!uid) {
      return res
        .status(401)
        .json(
          new ApiResponse(401, null, "User authentication required to place order", false),
        );
    }

    let summary;
    try {
      summary = await prepareCartOrderData({
        userId: uid,
        cartId: cId,
        addressId: aId,
        couponCode: cCode,
        selectedItemIds: selItemIds,
      });
    } catch (err) {
      if (err.outOfStockItems && Array.isArray(err.outOfStockItems)) {
        return res.status(400).json({
          success: false,
          message: err.message,
          outOfStockItems: err.outOfStockItems,
        });
      }
      return res.status(400).json(
        new ApiResponse(
          400,
          null,
          `Failed to place order after payment: ${err.message}`,
          false,
        ),
      );
    }

    const order = new Order({
      user: uid,
      items: summary.orderItems,
      address: summary.addressSnapshot,
      totalAmount: summary.totalAmount,
      discountedTotalAmount: summary.discountedTotalAmount,
      shippingCost: summary.shippingCost,
      shippingDetails: summary.shippingDetails,
      coupon: summary.couponResult ? summary.couponResult.coupon._id : null,
      couponCode: summary.couponResult ? summary.couponResult.coupon.code : null,
      couponDiscountAmount: summary.couponDiscountAmount,
      finalTotalAmount: summary.finalTotalAmount,
      paymentMode: "ONLINE",
      paymentStatus: "paid",
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      paymentMethod: paymentMethod,
      status: "confirmed",
      paidAt: new Date(),
    });
    await order.save();

    // Apply coupon usage
    if (summary.couponResult) {
      CouponService.applyCouponUsage({
        couponId: summary.couponResult.coupon._id,
        userId: uid,
        orderId: order._id,
        discountAmount: summary.couponDiscountAmount,
        orderTotal: summary.discountedTotalAmount,
      }).catch((error) =>
        console.error(`Coupon usage recording failed for order ${order._id}:`, error.message),
      );
    }

    // Deduct inventory atomically
    try {
      await InventoryService.deductForOrder(order);
    } catch (error) {
      console.error(`Inventory deduction failed for order ${order._id}:`, error.message);
    }

    // Clear purchased items from cart
    const orderedIdsSet = new Set(summary.processedCartItemIds);
    summary.cart.items = summary.cart.items.filter((ci) => !orderedIdsSet.has(ci._id ? ci._id.toString() : ""));
    await summary.cart.save();

    // Generate order bill / invoice PDF
    try {
      await ensureOrderBillGenerated(order);
    } catch (billError) {
      console.error(`Bill generation failed for order ${order._id}:`, billError.message);
    }

    // Send order confirmation emails
    const user = await User.findById(uid);
    if (user) {
      await sendOrderNotificationEmailsAsync(order, user);
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        order,
        "Payment verified and order created successfully",
        true,
      ),
    );
  } catch (error) {
    if (error.outOfStockItems && Array.isArray(error.outOfStockItems)) {
      return res.status(400).json({
        success: false,
        message: error.message,
        outOfStockItems: error.outOfStockItems,
      });
    }
    console.error("Error creating order upon payment verification:", error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Failed to place order after payment: ${error.message}`,
          false,
        ),
      );
  }
});

const getRazorpayConfig = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        keyId: process.env.RAZORPAY_KEY_ID || null,
        enabled: Boolean(process.env.RAZORPAY_KEY_ID),
      },
      "Razorpay config fetched successfully",
      true,
    ),
  );
});

const refundOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    amount,
    refundAmount: bodyRefundAmount,
    refundMode,
    refundMethod,
    mode,
    transactionId,
    utrNo,
    utr_number,
    refundTransactionId,
    refundTo,
    destination,
    to,
    reason,
    refundReason,
    notes,
    refundStatus,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID format", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  // Parse refund amount
  const calculatedAmount =
    bodyRefundAmount !== undefined
      ? parseFloat(bodyRefundAmount)
      : amount !== undefined
      ? parseFloat(amount)
      : parseFloat(order.finalTotalAmount.toString());

  if (isNaN(calculatedAmount) || calculatedAmount <= 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid refund amount", false));
  }

  const orderTotal = parseFloat(order.finalTotalAmount.toString());
  if (calculatedAmount > orderTotal) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          `Refund amount (₹${calculatedAmount}) cannot exceed order total (₹${orderTotal})`,
          false,
        ),
      );
  }

  // Determine refund mode (razorpay, manual_upi, upi, bank_transfer, cash, other)
  const rawMode = refundMode || refundMethod || mode;
  const selectedMode = rawMode
    ? rawMode.toString().toLowerCase().trim()
    : order.paymentMode === "COD" || !order.paymentId
    ? "manual_upi"
    : "razorpay";

  const targetTxnId =
    refundTransactionId || transactionId || utrNo || utr_number || null;
  const targetRefundTo = refundTo || destination || to || null;
  const targetReason = refundReason || reason || notes || null;
  const targetStatus = refundStatus || "initiated";

  const previousStatus = order.status;
  let rzpRefund = null;

  try {
    if (selectedMode === "razorpay") {
      const rzpPaymentId =
        req.body.paymentId ||
        req.body.razorpayPaymentId ||
        targetTxnId ||
        order.paymentId;

      if (!rzpPaymentId) {
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              "Razorpay Transaction / Payment ID (pay_...) is required to process refund via Razorpay. Please enter the Razorpay Transaction ID or select Owner UPI / Bank Transfer mode.",
              false,
            ),
          );
      }

      const amountInPaise = Math.round(calculatedAmount * 100);
      const refundOptions = {
        amount: amountInPaise,
        notes: {
          orderId: order._id.toString(),
          reason: targetReason || "Admin initiated refund",
          refundTo: targetRefundTo || "Original Payment Method",
        },
      };

      rzpRefund = await razorpay.payments.refund(
        rzpPaymentId,
        refundOptions,
      );

      order.paymentId = rzpPaymentId;
      order.refundId = rzpRefund.id;
      order.refundTransactionId = rzpRefund.id || rzpPaymentId;
      order.refundMode = "razorpay";
      order.refundTo = targetRefundTo || "Original Payment Method (Razorpay)";
      order.refundStatus = targetStatus === "initiated" ? "processed" : targetStatus;
      order.refundedAt = new Date();
    } else {
      // Manual UPI / Owner UPI / Bank Transfer
      order.refundId = targetTxnId || `REF-${Date.now()}`;
      order.refundTransactionId = targetTxnId;
      order.refundMode = selectedMode;
      order.refundTo = targetRefundTo;
      order.refundStatus = targetStatus;
      if (targetStatus === "processed" || targetStatus === "completed") {
        order.refundedAt = new Date();
      } else {
        order.refundInitiatedAt = new Date();
      }
    }

    order.refundAmount = calculatedAmount;
    order.refundReason = targetReason;
    if (targetStatus === "processed" || targetStatus === "completed") {
      order.paymentStatus =
        calculatedAmount >= orderTotal ? "refunded" : "partially_refunded";
      order.status = "refunded";
    } else if (targetStatus === "failed") {
      order.paymentStatus = "refund_failed";
      order.status = "refund_failed";
    } else {
      // initiated / pending
      order.paymentStatus = "refund_initiated";
      order.status = "refund_initiated";
    }
    await order.save();

    // Send refund status update email
    const user = order.user ? await User.findById(order.user) : null;
    const targetUser = user || (order.guestInfo?.email ? { name: order.guestInfo.name || "Customer", email: order.guestInfo.email } : (order.address?.email ? { name: order.address.name || "Customer", email: order.address.email } : null));
    if (targetUser && targetUser.email) {
      setImmediate(async () => {
        try {
          await sendStatusUpdateEmails({
            order: order.toObject(),
            user: typeof targetUser.toObject === "function" ? targetUser.toObject() : targetUser,
            previousStatus,
            updatedBy: req.admin ? req.admin.toObject() : null,
          });
        } catch (emailErr) {
          console.error("❌ Failed to send refund status email:", emailErr.message);
        }
      });
    }

    if (!["cancelled", "refunded"].includes(previousStatus)) {
      InventoryService.restoreForCancelledOrder(order).catch((err) =>
        console.error(
          `Inventory restore failed for refunded order ${order._id}:`,
          err.message,
        ),
      );
      CouponService.releaseCouponUsage(order._id).catch((err) =>
        console.error(
          `Coupon release failed for refunded order ${order._id}:`,
          err.message,
        ),
      );
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          order,
          refund: rzpRefund,
        },
        `Order refund ${targetStatus} successfully`,
        true,
      ),
    );
  } catch (error) {
    console.error("Refund processing failed:", error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          `Refund failed: ${error.message || "Unknown error"}`,
          false,
        ),
      );
  }
});

const updateRefundStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    refundStatus,
    refundTransactionId,
    transactionId,
    utrNo,
    utr_number,
    refundReason,
    reason,
    notes,
    refundTo,
    destination,
    amount,
    refundAmount,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID format", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  const validStatuses = ["initiated", "pending", "processing", "processed", "completed", "failed"];
  const normalizedStatus = refundStatus ? refundStatus.toString().toLowerCase().trim() : null;

  if (!normalizedStatus || !validStatuses.includes(normalizedStatus)) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          `Invalid refund status. Must be one of: ${validStatuses.join(", ")}`,
          false,
        ),
      );
  }

  const previousStatus = order.status;
  order.refundStatus = normalizedStatus === "completed" ? "processed" : normalizedStatus;

  if (normalizedStatus === "processed" || normalizedStatus === "completed") {
    order.refundedAt = order.refundedAt || new Date();
    order.status = "refunded";
    order.paymentStatus = "refunded";
  } else if (normalizedStatus === "failed") {
    order.status = "refund_failed";
    order.paymentStatus = "refund_failed";
  } else if (normalizedStatus === "initiated" || normalizedStatus === "pending") {
    order.refundInitiatedAt = order.refundInitiatedAt || new Date();
    order.status = "refund_initiated";
    order.paymentStatus = "refund_initiated";
  }

  const targetTxn = refundTransactionId || transactionId || utrNo || utr_number;
  if (targetTxn) {
    order.refundTransactionId = targetTxn;
  }
  const targetDest = refundTo || destination;
  if (targetDest) {
    order.refundTo = targetDest;
  }
  const targetRsn = refundReason || reason || notes;
  if (targetRsn) {
    order.refundReason = targetRsn;
  }
  if (refundAmount !== undefined || amount !== undefined) {
    order.refundAmount = parseFloat(refundAmount !== undefined ? refundAmount : amount);
  } else if (!order.refundAmount) {
    order.refundAmount = parseFloat(order.finalTotalAmount.toString());
  }

  await order.save();

  // Send refund update email
  const user = order.user ? await User.findById(order.user) : null;
  const targetUser = user || (order.guestInfo?.email ? { name: order.guestInfo.name || "Customer", email: order.guestInfo.email } : (order.address?.email ? { name: order.address.name || "Customer", email: order.address.email } : null));
  if (targetUser && targetUser.email) {
    setImmediate(async () => {
      try {
        await sendStatusUpdateEmails({
          order: order.toObject(),
          user: typeof targetUser.toObject === "function" ? targetUser.toObject() : targetUser,
          previousStatus,
          updatedBy: req.admin ? req.admin.toObject() : null,
        });
      } catch (emailErr) {
        console.error("❌ Failed to send refund update email:", emailErr.message);
      }
    });
  }

  if (normalizedStatus === "processed" || normalizedStatus === "initiated") {
    if (!["cancelled", "refunded"].includes(previousStatus)) {
      InventoryService.restoreForCancelledOrder(order).catch((err) =>
        console.error(`Inventory restore failed for refunded order ${order._id}:`, err.message)
      );
      CouponService.releaseCouponUsage(order._id).catch((err) =>
        console.error(`Coupon release failed for refunded order ${order._id}:`, err.message)
      );
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      order,
      `Refund status updated to ${normalizedStatus} successfully`,
      true,
    ),
  );
});

/**
 * Admin: Create order in Shiprocket for a specific order ID
 */
const createShiprocketOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { weight, length, breadth, height, pickup_location } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  // Validate package details: weight, length, breadth, height are required and must be positive numbers
  const parsedWeight = parseFloat(weight);
  const parsedLength = parseFloat(length);
  const parsedBreadth = parseFloat(breadth);
  const parsedHeight = parseFloat(height);

  if (
    weight === undefined ||
    weight === null ||
    isNaN(parsedWeight) ||
    parsedWeight <= 0 ||
    length === undefined ||
    length === null ||
    isNaN(parsedLength) ||
    parsedLength <= 0 ||
    breadth === undefined ||
    breadth === null ||
    isNaN(parsedBreadth) ||
    parsedBreadth <= 0 ||
    height === undefined ||
    height === null ||
    isNaN(parsedHeight) ||
    parsedHeight <= 0
  ) {
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        "Package details (weight, length, breadth, height) are required and must be valid positive numbers",
        false
      )
    );
  }

  const order = await Order.findById(id).populate("user");
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  // Idempotency: if Shiprocket order already exists, return it
  if (order.shipping?.shiprocketOrderId) {
    return res.status(200).json(
      new ApiResponse(
        200,
        order,
        "Shiprocket order already created for this order",
        true,
      ),
    );
  }

  const syncResult = await syncOrderToShiprocket(order, {
    packageDetails: {
      weight: parsedWeight,
      length: parsedLength,
      breadth: parsedBreadth,
      height: parsedHeight,
    },
    pickupLocation: pickup_location || null,
    logErrors: true,
  });

  if (!syncResult.success) {
    return res.status(400).json(
      new ApiResponse(
        400,
        order,
        `Shiprocket order creation failed: ${syncResult.error}`,
        false,
      ),
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      order,
      "Shiprocket order created successfully",
      true,
    ),
  );
});

/**
 * Admin: Assign Courier / AWB to order shipment
 */
const assignShiprocketAwb = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { courier_id } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  if (!order.shipping?.shipmentId) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Shiprocket shipment ID does not exist for this order. Please create the Shiprocket order first.",
          false,
        ),
      );
  }

  // Idempotency: if AWB already assigned, return existing
  if (order.shipping?.awbCode) {
    return res.status(200).json(
      new ApiResponse(
        200,
        order,
        "AWB is already assigned to this shipment",
        true,
      ),
    );
  }

  try {
    const result = await ShiprocketService.assignAwb({
      shipmentId: order.shipping.shipmentId,
      courierId: courier_id || null,
    });

    const awbData = result?.response?.data || result;
    const awbCode = awbData?.awb_code || result?.awb_code || null;
    const courierName = awbData?.courier_name || result?.courier_name || null;
    const courierCompanyId = awbData?.courier_company_id || result?.courier_company_id || null;

    if (!awbCode) {
      throw new Error(
        awbData?.message || result?.message || "Failed to retrieve AWB code from Shiprocket response",
      );
    }

    order.shipping.awbCode = String(awbCode);
    order.shipping.courierName = courierName;
    order.shipping.courierCompanyId = courierCompanyId ? Number(courierCompanyId) : null;
    order.shipping.status = "AWB Assigned";
    order.shipping.error = null;

    if (order.status === "pending" || order.status === "confirmed") {
      order.status = "processing";
    }

    await order.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        order,
        "AWB assigned successfully",
        true,
      ),
    );
  } catch (err) {
    console.error(`[Shiprocket AWB Error] Order ${order._id}:`, err.message);
    order.shipping.error = err.message;
    await order.save().catch(() => {});
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to assign AWB: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Admin: Generate pickup request for shipment
 */
const generateShiprocketPickup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pickup_date } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  if (!order.shipping?.shipmentId || !order.shipping?.awbCode) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Shipment ID and AWB code are required before scheduling pickup",
          false,
        ),
      );
  }

  // Idempotency: if pickup already scheduled
  if (order.shipping?.pickupScheduledAt) {
    return res.status(200).json(
      new ApiResponse(
        200,
        order,
        "Pickup is already scheduled for this shipment",
        true,
      ),
    );
  }

  try {
    const result = await ShiprocketService.generatePickup({
      shipmentId: order.shipping.shipmentId,
      pickupDate: pickup_date || null,
    });

    order.shipping.pickupScheduledAt = new Date();
    order.shipping.pickupTokenNumber =
      result?.response?.pickup_token_number ||
      result?.pickup_token_number ||
      null;
    order.shipping.status = "Pickup Scheduled";
    order.shipping.error = null;

    await order.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        order,
        "Pickup scheduled successfully",
        true,
      ),
    );
  } catch (err) {
    console.error(`[Shiprocket Pickup Error] Order ${order._id}:`, err.message);
    order.shipping.error = err.message;
    await order.save().catch(() => {});
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to generate pickup: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Admin: Generate shipping label
 */
const generateShiprocketLabel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  if (!order.shipping?.shipmentId) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Shipment ID is required to generate label",
          false,
        ),
      );
  }

  try {
    const result = await ShiprocketService.generateLabel({
      shipmentId: order.shipping.shipmentId,
    });

    const labelUrl = result?.label_url || result?.label_created || order.shipping.labelUrl || null;
    if (labelUrl) {
      order.shipping.labelUrl = labelUrl;
      await order.save();
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        { label_url: labelUrl, order },
        "Shipping label generated successfully",
        true,
      ),
    );
  } catch (err) {
    console.error(`[Shiprocket Label Error] Order ${order._id}:`, err.message);
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to generate label: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Admin: Generate shipping manifest
 */
const generateShiprocketManifest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  if (!order.shipping?.shipmentId) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Shipment ID is required to generate manifest",
          false,
        ),
      );
  }

  try {
    const result = await ShiprocketService.generateManifest({
      shipmentId: order.shipping.shipmentId,
    });

    const manifestUrl = result?.manifest_url || order.shipping.manifestUrl || null;
    if (manifestUrl) {
      order.shipping.manifestUrl = manifestUrl;
      await order.save();
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        { manifest_url: manifestUrl, order },
        "Shipping manifest generated successfully",
        true,
      ),
    );
  } catch (err) {
    console.error(`[Shiprocket Manifest Error] Order ${order._id}:`, err.message);
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to generate manifest: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Admin: Print shipping manifest
 */
const printShiprocketManifest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  const orderIdForManifest = order.shipping?.shiprocketOrderId || order.orderNumber || order._id;

  try {
    const result = await ShiprocketService.printManifest({
      orderIds: [orderIdForManifest],
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Manifest print response fetched successfully",
        true,
      ),
    );
  } catch (err) {
    console.error(`[Shiprocket Print Manifest Error] Order ${order._id}:`, err.message);
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to print manifest: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Admin: Get live tracking info from Shiprocket
 */
const getShiprocketTracking = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  const awbCode = order.shipping?.awbCode;
  const shipmentId = order.shipping?.shipmentId;

  if (!awbCode && !shipmentId) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "No AWB code or Shipment ID found for this order. Please create the Shiprocket order and assign AWB first.",
          false,
        ),
      );
  }

  try {
    const result = awbCode
      ? await ShiprocketService.trackByAwb(awbCode)
      : await ShiprocketService.trackByShipmentId(shipmentId);

    order.shipping.lastTrackingResponse = result;

    // Check if tracking response has updated current status
    const trackingData = result?.tracking_data || result;
    const currentStatus =
      trackingData?.shipment_track?.[0]?.current_status ||
      trackingData?.track_status ||
      null;

    if (currentStatus) {
      order.shipping.status = currentStatus;
      const mapped = ShiprocketService.mapShiprocketStatusToInternal(currentStatus);
      if (mapped && mapped !== order.status) {
        order.status = mapped;
        if (mapped === "out_for_delivery" && !order.outForDeliveryAt) {
          order.outForDeliveryAt = new Date();
        }
        if (mapped === "delivered" && !order.deliveredAt) {
          order.deliveredAt = new Date();
          order.shipping.deliveredAt = new Date();
        }
      }
    }

    await order.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        { tracking: result, order },
        "Shipment tracking fetched successfully",
        true,
      ),
    );
  } catch (err) {
    console.error(`[Shiprocket Tracking Error] Order ${order._id}:`, err.message);
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to fetch tracking: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Admin: Cancel order in Shiprocket
 */
const cancelShiprocketOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid order ID", false));
  }

  const order = await Order.findById(id);
  if (!order) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "Order not found", false));
  }

  if (!order.shipping?.shiprocketOrderId && !order.shipping?.awbCode) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Order is not synchronized with Shiprocket",
          false,
        ),
      );
  }

  try {
    const result = await ShiprocketService.cancelOrder({
      shiprocketOrderId: order.shipping?.shiprocketOrderId,
      awbCode: order.shipping?.awbCode,
    });

    order.shipping.status = "CANCELLED";
    order.shipping.cancelledAt = new Date();
    await order.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        { result, order },
        "Shiprocket order cancelled successfully",
        true,
      ),
    );
  } catch (err) {
    console.error(`[Shiprocket Cancel Error] Order ${order._id}:`, err.message);
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to cancel Shiprocket order: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Admin: Check courier serviceability (via query params or order ID)
 */
const checkShiprocketServiceability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { pickup_postcode, delivery_postcode, weight, cod } = req.query;

  if (id && mongoose.Types.ObjectId.isValid(id)) {
    const order = await Order.findById(id);
    if (order) {
      delivery_postcode = delivery_postcode || order.address?.pincode;
      if (cod === undefined) {
        cod = order.paymentMode === "COD";
      }
    }
  }

  if (!pickup_postcode && process.env.SHIPROCKET_PICKUP_POSTCODE) {
    pickup_postcode = process.env.SHIPROCKET_PICKUP_POSTCODE;
  }

  if (!pickup_postcode || !delivery_postcode) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "pickup_postcode and delivery_postcode are required query parameters",
          false,
        ),
      );
  }

  try {
    const result = await ShiprocketService.checkServiceability({
      pickupPostcode: pickup_postcode,
      deliveryPostcode: delivery_postcode,
      weight: weight ? parseFloat(weight) : undefined,
      cod: cod === "1" || cod === "true" || cod === true,
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Courier serviceability fetched successfully",
        true,
      ),
    );
  } catch (err) {
    console.error("[Shiprocket Serviceability Error]:", err.message);
    return res.status(400).json(
      new ApiResponse(
        400,
        null,
        `Failed to check serviceability: ${err.message}`,
        false,
      ),
    );
  }
});

/**
 * Webhook: Handle Shiprocket tracking/status push notifications
 */
const handleShiprocketWebhook = asyncHandler(async (req, res) => {
  const webhookToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (webhookToken) {
    const headerToken =
      req.headers["x-api-key"] ||
      req.headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
      req.query.token;

    if (headerToken !== webhookToken) {
      console.warn("Unauthorized Shiprocket webhook attempt blocked");
      return res.status(401).json({ success: false, message: "Unauthorized webhook request" });
    }
  }

  const payload = req.body || {};
  const {
    awb,
    shipment_id,
    order_id,
    current_status,
    status,
    courier_name,
  } = payload;

  const statusText = current_status || status;

  if (!awb && !shipment_id && !order_id) {
    return res.status(400).json({ success: false, message: "Missing tracking identifiers (awb, shipment_id, order_id)" });
  }

  // Find matching order in DB
  const queryOrConditions = [];
  if (awb) queryOrConditions.push({ "shipping.awbCode": String(awb).trim() });
  if (shipment_id) queryOrConditions.push({ "shipping.shipmentId": String(shipment_id).trim() });
  if (order_id) {
    queryOrConditions.push({ "shipping.shiprocketOrderId": String(order_id).trim() });
    if (mongoose.Types.ObjectId.isValid(order_id)) {
      queryOrConditions.push({ _id: order_id });
    }
    const cleanNum = String(order_id).replace(/^OD-|^#/, "");
    if (/^\d+$/.test(cleanNum)) {
      queryOrConditions.push({ orderNumber: parseInt(cleanNum, 10) });
    }
  }

  let order = null;
  if (queryOrConditions.length > 0) {
    order = await Order.findOne({ $or: queryOrConditions });
  }

  if (!order) {
    console.log(`[Shiprocket Webhook] No matching order found for AWB: ${awb}, Shipment ID: ${shipment_id}, Order ID: ${order_id}`);
    return res.status(200).json({ success: true, message: "Webhook acknowledged; order not found in local system" });
  }

  if (!order.shipping) {
    order.shipping = {};
  }

  order.shipping.lastTrackingResponse = payload;
  if (statusText) {
    order.shipping.status = statusText;
  }
  if (courier_name && !order.shipping.courierName) {
    order.shipping.courierName = courier_name;
  }

  const mappedInternalStatus = ShiprocketService.mapShiprocketStatusToInternal(statusText);
  if (mappedInternalStatus && mappedInternalStatus !== order.status) {
    const previousStatus = order.status;
    order.status = mappedInternalStatus;

    if (mappedInternalStatus === "shipped" && !order.shipping.shippedAt) {
      order.shipping.shippedAt = new Date();
    }
    if (mappedInternalStatus === "out_for_delivery" && !order.outForDeliveryAt) {
      order.outForDeliveryAt = new Date();
    }
    if (mappedInternalStatus === "delivered") {
      order.deliveredAt = order.deliveredAt || new Date();
      order.shipping.deliveredAt = order.shipping.deliveredAt || new Date();
      if (order.paymentMode === "COD" && order.paymentStatus !== "paid") {
        order.paymentStatus = "paid";
        order.paidAt = order.paidAt || new Date();
      }
    }
    if (mappedInternalStatus === "cancelled" && !order.shipping.cancelledAt) {
      order.shipping.cancelledAt = new Date();
    }

    await order.save();

    // Send customer update emails asynchronously
    const user = order.user ? await User.findById(order.user) : null;
    const targetUser =
      user ||
      (order.guestInfo?.email
        ? { name: order.guestInfo.name || "Customer", email: order.guestInfo.email }
        : order.address?.email
        ? { name: order.address.name || "Customer", email: order.address.email }
        : null);

    if (targetUser && targetUser.email) {
      setImmediate(async () => {
        try {
          await sendStatusUpdateEmails({
            order: order.toObject(),
            user: typeof targetUser.toObject === "function" ? targetUser.toObject() : targetUser,
            previousStatus,
            updatedBy: { name: "Shiprocket Webhook", role: "system" },
          });
        } catch (emailErr) {
          console.error("❌ Failed to send status update email from Shiprocket webhook:", emailErr.message);
        }
      });
    }
  } else {
    await order.save();
  }

  return res.status(200).json({ success: true, message: "Shiprocket webhook processed successfully" });
});

module.exports = {
  exportOrders,
  createOrder,
  createGuestOrder,
  getOrderHistory,
  getAllOrders,
  updateOrder,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  getOrderById,
  getOrderBill,
  editOrder,
  cancelOrder,
  returnOrder,
  getProductsWithOrderCounts,
  getOrdersByProductId,
  getOrderByIdFormUser,
  getOrderEmailStatus,
  generatePaymentLinks,
  handlePaymentWebhook,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getRazorpayConfig,
  refundOrder,
  updateRefundStatus,
  // Shiprocket exports
  createShiprocketOrder,
  assignShiprocketAwb,
  generateShiprocketPickup,
  generateShiprocketLabel,
  generateShiprocketManifest,
  printShiprocketManifest,
  getShiprocketTracking,
  cancelShiprocketOrder,
  checkShiprocketServiceability,
  handleShiprocketWebhook,
};

