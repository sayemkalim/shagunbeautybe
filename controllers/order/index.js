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
const razorpay = require("../../config/razorpay");

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
      orderNumber: order.orderNumber ? `#${order.orderNumber}` : order._id.toString(),
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
  const { items, address } = req.body;

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

  for (const item of items) {
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

      const product = await Product.findById(item.product_id);
      if (!product) {
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

      const price = parseFloat(product.price.toString());
      const discountedPrice = product.discounted_price
        ? parseFloat(product.discounted_price.toString())
        : price;
      const quantity = item.quantity || 1;
      const itemTotal = price * quantity;
      const discountedItemTotal = discountedPrice * quantity;
      totalAmount += itemTotal;
      discountedTotalAmount += discountedItemTotal;

      // Calculate weight for shipping
      if (product.weight_in_grams) {
        totalWeightGrams += product.weight_in_grams * quantity;
      }

      orderItems.push({
        type: "product",
        product: {
          _id: product._id,
          name: product.name,
          price: product.price,
          discounted_price: product.discounted_price,
          banner_image: product.banner_image,
          sub_category: product.sub_category,
        },
        quantity: quantity,
        total_amount: itemTotal,
        discounted_total_amount: discountedItemTotal,
      });
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

      const price = parseFloat(bundle.price.toString());
      const discountedPrice = bundle.discounted_price
        ? parseFloat(bundle.discounted_price.toString())
        : price;
      const quantity = item.quantity || 1;
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

  // Calculate shipping cost based on pincode and total weight
  const { shippingCost, shippingDetails } = await calculateShippingCost(
    address.pincode,
    totalWeightGrams,
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
    status: "pending",
  });
  await order.save();

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
            to: 'theceliacstore@gmail.com', 
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
            to: 'theceliacstore@gmail.com',
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

const createOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { cartId, addressId } = req.body;

  if (
    !mongoose.Types.ObjectId.isValid(cartId) ||
    !mongoose.Types.ObjectId.isValid(addressId)
  ) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid cart or address ID", false));
  }

  const cart = await Cart.findOne({ _id: cartId, user: userId });
  if (!cart || cart.items.length === 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Cart not found or empty", false));
  }
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Address not found", false));
  }

  let totalAmount = 0;
  let discountedTotalAmount = 0;
  let totalWeightGrams = 0;
  const orderItems = [];
  for (const cartItem of cart.items) {
    if (cartItem.type === "product") {
      const product = await Product.findById(cartItem.product);
      if (!product) continue;
      const price = parseFloat(product.price.toString());
      const discountedPrice = product.discounted_price
        ? parseFloat(product.discounted_price.toString())
        : price;
      const itemTotal = price * cartItem.quantity;
      const discountedItemTotal = discountedPrice * cartItem.quantity;
      totalAmount += itemTotal;
      discountedTotalAmount += discountedItemTotal;

      // Calculate weight for shipping
      if (product.weight_in_grams) {
        totalWeightGrams += product.weight_in_grams * cartItem.quantity;
      }

      orderItems.push({
        type: "product",
        product: {
          _id: product._id,
          name: product.name,
          price: product.price,
          discounted_price: product.discounted_price,
          banner_image: product.banner_image,
          sub_category: product.sub_category,
        },
        quantity: cartItem.quantity,
        total_amount: itemTotal,
        discounted_total_amount: discountedItemTotal,
      });
    } else if (cartItem.type === "bundle") {
      const bundle = await Bundle.findById(cartItem.bundle);
      if (!bundle) continue;
      const price = parseFloat(bundle.price.toString());
      const discountedPrice = bundle.discounted_price
        ? parseFloat(bundle.discounted_price.toString())
        : price;
      const itemTotal = price * cartItem.quantity;
      const discountedItemTotal = discountedPrice * cartItem.quantity;
      totalAmount += itemTotal;
      discountedTotalAmount += discountedItemTotal;

      // Calculate weight for bundles - sum up all products in the bundle
      if (bundle.products && Array.isArray(bundle.products)) {
        for (const bundleProduct of bundle.products) {
          const product = await Product.findById(bundleProduct.product);
          if (product && product.weight_in_grams) {
            totalWeightGrams +=
              product.weight_in_grams *
              bundleProduct.quantity *
              cartItem.quantity;
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
        quantity: cartItem.quantity,
        total_amount: itemTotal,
        discounted_total_amount: discountedItemTotal,
      });
    }
  }

  const addressSnapshot = { ...address.toObject() };
  delete addressSnapshot._id;
  delete addressSnapshot.user;
  delete addressSnapshot.createdAt;
  delete addressSnapshot.updatedAt;
  delete addressSnapshot.__v;

  // Calculate shipping cost based on pincode and total weight
  // This creates a snapshot of the shipping cost at order time
  const { shippingCost, shippingDetails } = await calculateShippingCost(
    address.pincode,
    totalWeightGrams,
  );

  // Calculate final total amount (discounted total + shipping)
  const finalTotalAmount = discountedTotalAmount + shippingCost;

  const order = new Order({
    user: userId,
    items: orderItems,
    address: addressSnapshot,
    totalAmount,
    discountedTotalAmount,
    shippingCost,
    shippingDetails,
    finalTotalAmount,
    status: "pending",
  });
  await order.save();

  cart.items = [];
  await cart.save();

  // Send order confirmation emails directly (async - won't block response)
  const user = await User.findById(userId);

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
      // Send customer email
      const customerHtmlContent = generateCustomerOrderConfirmation(
        order.toObject(),
        user.toObject(),
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
        // Update email tracking status
        order.emailTracking.confirmation.status = "sent";
        order.emailTracking.confirmation.sentAt = new Date();
        await order.save();
      }

      // Send admin email
      const admins = await Admin.find({
        role: { $in: ["super_admin"] },
      }).select("email");

      const adminEmails = admins.map((admin) => admin.email).filter(Boolean);

      if (adminEmails.length > 0) {
        const adminHtmlContent = generateCompanyOrderNotification(
          order.toObject(),
          user.toObject(),
        );
        const adminEmailOptions = {
          to: "theceliacstore@gmail.com", // Send to first admin (Brevo API handles single recipient)
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
      // Update email tracking status
      order.emailTracking.confirmation.status = "failed";
      order.emailTracking.confirmation.failedAt = new Date();
      order.emailTracking.confirmation.error = error.message;
      await order.save();
    }
  })();

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
  const { status } = req.body;

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

  // Validate status values
  const validStatuses = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];
  if (!validStatuses.includes(status)) {
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
  order.status = status;
  await order.save();

  // Send status update emails directly (async - won't block response)
  const user = await User.findById(order.user);

  // Add status update email tracking entry as queued
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

  // Send emails asynchronously (non-blocking)

  console.log(user, "user");
  setImmediate(async () => {
    try {
      const htmlContent = generateCustomerOrderConfirmation(order, user);
      const emailOptions = {
        to: user.email,
        subject: `Order Received - ${order._id}`,
        html: htmlContent,
      };

      const emailSent = await sendEmail(emailOptions);

      if (emailSent.accepted.length > 0) {
        console.log("✅ Status update email sent successfully:", emailSent);
      }
    } catch (error) {
      console.error("❌ Failed to send status update emails:", error.message);
    }
  });

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

  // Validate status values
  const validStatuses = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];
  if (!validStatuses.includes(status)) {
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
      order.status = status;

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

      // Send status update email asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          const user = await User.findById(order.user);
          if (user) {
            await sendStatusUpdateEmails({
              order: order.toObject(),
              user: user.toObject(),
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
        const price = parseFloat(product.price.toString());
        const discountedPrice = product.discounted_price
          ? parseFloat(product.discounted_price.toString())
          : price;
        const itemTotal = price * item.quantity;
        const discountedItemTotal = discountedPrice * item.quantity;
        totalAmount += itemTotal;
        discountedTotalAmount += discountedItemTotal;

        // Calculate weight for shipping
        if (product.weight_in_grams) {
          totalWeightGrams += product.weight_in_grams * item.quantity;
        }

        orderItems.push({
          type: "product",
          product: {
            _id: product._id,
            name: product.name,
            price: product.price,
            discounted_price: product.discounted_price,
            banner_image: product.banner_image,
            sub_category: product.sub_category,
          },
          quantity: item.quantity,
          total_amount: itemTotal,
          discounted_total_amount: discountedItemTotal,
        });
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

  // Recalculate shipping if address or items changed
  if (newAddress || orderItems.length > 0) {
    const pincode = newAddress ? newAddress.pincode : order.address.pincode;
    const { shippingCost, shippingDetails } = await calculateShippingCost(
      pincode,
      totalWeightGrams,
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
        "delivered",
        "cancelled",
      ];
      if (validStatuses.includes(status)) {
        orderQuery.status = status;
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
                banner_image: item.product.banner_image,
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
            banner_image: product.banner_image,
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
        "delivered",
        "cancelled",
      ];

      if (!validStatuses.includes(updateData.status)) {
        return res
          .status(400)
          .json(new ApiResponse(400, null, "Invalid status", false));
      }

      order.status = updateData.status;
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

        const price = parseFloat(product.price.toString());
        const discountedPrice = product.discounted_price
          ? parseFloat(product.discounted_price.toString())
          : price;
        const itemTotal = price * qty;
        const discountedItemTotal = discountedPrice * qty;

        // Add new product to order items
        order.items.push({
          type: "product",
          product: {
            _id: product._id,
            name: product.name,
            price: product.price,
            discounted_price: product.discounted_price,
            banner_image: product.banner_image,
            sub_category: product.sub_category,
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

          const price = parseFloat(product.price.toString());
          const discountedPrice = product.discounted_price
            ? parseFloat(product.discounted_price.toString())
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

      // Recalculate shipping based on new weight and/or address
      const pincode = order.address.pincode;
      const result = await calculateShippingCost(pincode, totalWeightGrams);

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

    await order.save();

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
              banner_image: item.product.banner_image,
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
          banner_image: productDetails.banner_image,
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

    // Create payment link using Razorpay
    const paymentLinkOptions = {
      amount: amountInPaise,
      currency: "INR",
      description: `Payment for Order #${orderId}`,
      customer: {
        name: order.address.name || "Customer",
        contact: order.address.mobile || "",
        email: req.user?.email || "",
      },
      notify: {
        sms: true,
        email: true,
      },
      reminder_enable: true,
    };

    const paymentLink = await razorpay.paymentLink.create(paymentLinkOptions);

    // Update h payorder witment link information
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
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Webhook signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body;
    console.log("Received webhook event:", event.event);

    // Handle payment captured event
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      const paymentLink = event.payload.payment_link?.entity;

      if (paymentLink) {
        // Find order by payment link ID
        const order = await Order.findOne({ paymentLinkId: paymentLink.id });

        if (order) {
          // Verify payment amount matches order amount
          const orderAmountInPaise = Math.round(
            parseFloat(order.finalTotalAmount.toString()) * 100,
          );

          if (
            payment.amount === orderAmountInPaise &&
            payment.status === "captured"
          ) {
            // Update order with payment details
            order.paymentStatus = "paid";
            order.paymentId = payment.id;
            order.paymentMethod = payment.method;
            order.paidAt = new Date();

            // Update order status to confirmed if it's still pending
            if (order.status === "pending") {
              order.status = "confirmed";
            }

            await order.save();

            console.log(
              `Payment captured for order ${order._id}, payment ID: ${payment.id}`,
            );
          } else {
            console.error(
              `Payment amount mismatch for order ${order._id}. Expected: ${orderAmountInPaise}, Received: ${payment.amount}`,
            );
          }
        } else {
          console.error(
            `Order not found for payment link ID: ${paymentLink.id}`,
          );
        }
      }
    }

    // Handle payment failed event
    if (event.event === "payment.failed") {
      const payment = event.payload.payment.entity;
      const paymentLink = event.payload.payment_link?.entity;

      if (paymentLink) {
        const order = await Order.findOne({ paymentLinkId: paymentLink.id });

        if (order) {
          order.paymentStatus = "failed";
          await order.save();

          console.log(
            `Payment failed for order ${order._id}, payment ID: ${payment.id}`,
          );
        }
      }
    }

    res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
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
  editOrder,
  getProductsWithOrderCounts,
  getOrdersByProductId,
  getOrderByIdFormUser,
  getOrderEmailStatus,
  generatePaymentLinks,
  handlePaymentWebhook,
};
