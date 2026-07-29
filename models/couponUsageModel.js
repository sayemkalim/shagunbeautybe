const mongoose = require("mongoose");

// Tracks each redemption of a coupon so per-user usage limits can be enforced
// and usage can be released if the associated order is cancelled.
const CouponUsageSchema = new mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    discount_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    order_total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

CouponUsageSchema.index({ coupon: 1, user: 1 });

const CouponUsage = mongoose.model("CouponUsage", CouponUsageSchema);
module.exports = CouponUsage;
