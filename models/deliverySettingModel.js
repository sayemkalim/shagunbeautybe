const mongoose = require("mongoose");

const DeliverySettingSchema = new mongoose.Schema(
  {
    is_delivery_fee_enabled: {
      type: Boolean,
      default: true,
    },
    min_order_amount: {
      type: Number,
      default: 1, // Range start: e.g. ₹1
      min: 0,
    },
    max_order_amount: {
      type: Number,
      default: 2000, // Range end: e.g. ₹2000
      min: 0,
    },
    delivery_fee: {
      type: Number,
      default: 50, // Delivery charge within range [min, max] (e.g. ₹50)
      min: 0,
    },
    free_delivery_above: {
      type: Number,
      default: 2000, // Orders above this amount get Free Delivery (₹0)
      min: 0,
    },
    description: {
      type: String,
      default: "Delivery Fee Settings (Min-Max Range)",
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

const DeliverySetting = mongoose.model("DeliverySetting", DeliverySettingSchema);
module.exports = DeliverySetting;
