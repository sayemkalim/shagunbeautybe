const express = require("express");
const router = express.Router();
const OrderController = require("../../controllers/order/index.js");
const { user, optionalUser } = require("../../middleware/auth/userMiddleware.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");

router.get("/export", adminOrSuperAdmin, OrderController.exportOrders);
router.get("/", adminOrSuperAdmin, OrderController.getAllOrders);
// router.get("/overview", adminOrSuperAdmin, OrderController.getOrderOverview);

router.post("/", user, OrderController.createOrder);
router.post("/guest", OrderController.createGuestOrder);
// router.post("/buy-now", user, OrderController.buyNowOrder);
router.get("/history", user, OrderController.getOrderHistory);
router.patch("/bulk-status", adminOrSuperAdmin, OrderController.bulkUpdateOrderStatus);
router.get("/products-with-orders", adminOrSuperAdmin, OrderController.getProductsWithOrderCounts);
router.get("/by-product/:productId", adminOrSuperAdmin, OrderController.getOrdersByProductId);
router.get("/:id/email-status", adminOrSuperAdmin, OrderController.getOrderEmailStatus);
router.patch("/:id", adminOrSuperAdmin, OrderController.updateOrder);
router.patch("/:id/shipping-package", adminOrSuperAdmin, OrderController.updateShippingPackage);
router.patch("/:id/status", adminOrSuperAdmin, OrderController.updateOrderStatus);
router.patch("/edit/:id", user, OrderController.editOrder);
router.patch("/payment/:id/cancel", user, OrderController.cancelOrder);
router.patch("/:id/cancel", user, OrderController.cancelOrder);
router.patch("/payment/:id/return", user, OrderController.returnOrder);
router.patch("/:id/return", user, OrderController.returnOrder);
router.post("/:id/return", user, OrderController.returnOrder);
router.get("/:id", adminOrSuperAdmin, OrderController.getOrderById);
router.get("/payment/:id/bill", adminOrSuperAdmin, OrderController.getOrderBill);
router.get("/user/:id", user, OrderController.getOrderByIdFormUser);
// router.get("/generate-order-bill/:id", user, OrderController.generateOrderBill);
router.post("/generate-payment-link", adminOrSuperAdmin, OrderController.generatePaymentLinks);

// Razorpay Standard Checkout (Popup) routes
router.get("/razorpay/config", OrderController.getRazorpayConfig);
router.post("/razorpay/create-order", optionalUser, OrderController.createRazorpayOrder);
router.post("/razorpay/verify-payment", optionalUser, OrderController.verifyRazorpayPayment);
router.post("/:id/refund", adminOrSuperAdmin, OrderController.refundOrder);
router.patch("/:id/refund-status", adminOrSuperAdmin, OrderController.updateRefundStatus);

// Shiprocket Shipping Admin Routes
router.get("/shiprocket/serviceability", adminOrSuperAdmin, OrderController.checkShiprocketServiceability);
router.get("/:id/shiprocket/serviceability", adminOrSuperAdmin, OrderController.checkShiprocketServiceability);
router.post("/:id/shiprocket/create", adminOrSuperAdmin, OrderController.createShiprocketOrder);
router.post("/:id/shiprocket/assign-awb", adminOrSuperAdmin, OrderController.assignShiprocketAwb);
router.post("/:id/shiprocket/pickup", adminOrSuperAdmin, OrderController.generateShiprocketPickup);
router.post("/:id/shiprocket/label", adminOrSuperAdmin, OrderController.generateShiprocketLabel);
router.post("/:id/shiprocket/manifest", adminOrSuperAdmin, OrderController.generateShiprocketManifest);
router.post("/:id/shiprocket/print-manifest", adminOrSuperAdmin, OrderController.printShiprocketManifest);
router.get("/:id/shiprocket/tracking", adminOrSuperAdmin, OrderController.getShiprocketTracking);
router.post("/:id/shiprocket/cancel", adminOrSuperAdmin, OrderController.cancelShiprocketOrder);

module.exports = router;

