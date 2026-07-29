const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    discount_type: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
    },
    discount_value: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (value) {
          if (this.discount_type === "percentage") {
            return value > 0 && value <= 100;
          }
          return value > 0;
        },
        message: "Percentage discount must be between 0 and 100",
      },
    },
    // Caps the discount amount for percentage coupons (ignored for flat coupons)
    max_discount_amount: {
      type: Number,
      min: 0,
      default: null,
    },
    min_order_value: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Max number of times this coupon can be used across all users. null = unlimited
    usage_limit_total: {
      type: Number,
      min: 1,
      default: null,
    },
    // Max number of times a single user can use this coupon
    usage_limit_per_user: {
      type: Number,
      min: 1,
      default: 1,
    },
    used_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    valid_from: {
      type: Date,
      default: Date.now,
    },
    // null = no expiry
    valid_until: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

CouponSchema.index({ is_active: 1 });

const Coupon = mongoose.model("Coupon", CouponSchema);
module.exports = Coupon;
