const mongoose = require("mongoose");

const DeliveryZoneSchema = new mongoose.Schema(
  {
    zone_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    pincodes: {
      type: [String],
      default: [],
    },
    pricing_type: {
      type: String,
      enum: ["free", "flat_rate", "fixed_rate", "flat_rate_plus_dynamic"],
      required: true,
    },
    // For flat_rate: pricing based on weight unit and multiplier
    weight_unit_grams: {
      type: Number,
      validate: {
        validator: function(weight) {
          if (this.pricing_type === "flat_rate" || this.pricing_type === "flat_rate_plus_dynamic") {
            return weight != null && weight > 0;
          }
          return true;
        },
        message: "Weight unit in grams is required for flat_rate and flat_rate_plus_dynamic pricing types",
      },
    },
    price: {
      type: Number,
      validate: {
        validator: function(price) {
          if (this.pricing_type === "flat_rate" || this.pricing_type === "flat_rate_plus_dynamic") {
            return price != null && price >= 0;
          }
          return true;
        },
        message: "Price is required for flat_rate and flat_rate_plus_dynamic pricing types",
      },
    },
    // For flat_rate_plus_dynamic: base flat rate charge
    flat_rate_base: {
      type: Number,
      validate: {
        validator: function(base) {
          if (this.pricing_type === "flat_rate_plus_dynamic") {
            return base != null && base >= 0;
          }
          return true;
        },
        message: "Flat rate base is required for flat_rate_plus_dynamic pricing type",
      },
    },
    // For flat_rate_plus_dynamic: minimum weight before dynamic pricing kicks in
    min_weight_grams: {
      type: Number,
      validate: {
        validator: function(minWeight) {
          if (this.pricing_type === "flat_rate_plus_dynamic") {
            return minWeight != null && minWeight > 0;
          }
          return true;
        },
        message: "Minimum weight in grams is required for flat_rate_plus_dynamic pricing type",
      },
    },
    // For fixed_rate: single fixed amount
    fixed_amount: {
      type: Number,
      validate: {
        validator: function(amount) {
          if (this.pricing_type === "fixed_rate") {
            return amount != null && amount >= 0;
          }
          return true;
        },
        message: "Fixed amount is required for fixed_rate pricing type",
      },
    },
    is_default: {
      type: Boolean,
      default: false,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// Index for faster pincode lookups
DeliveryZoneSchema.index({ pincodes: 1 });
DeliveryZoneSchema.index({ is_default: 1 });
DeliveryZoneSchema.index({ is_active: 1 });

const DeliveryZone = mongoose.model("DeliveryZone", DeliveryZoneSchema);
module.exports = DeliveryZone;

