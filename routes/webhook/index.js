const express = require("express");
const router = express.Router();
const OrderController = require("../../controllers/order/index.js");

// Webhook endpoint for Razorpay payment notifications
// This endpoint should not require authentication as it's called by Razorpay
router.post("/razorpay/payment", OrderController.handlePaymentWebhook);

module.exports = router;
