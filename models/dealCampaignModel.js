const mongoose = require("mongoose");

const dealCampaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Lowest Price Live", // e.g., "Flash Sale", "Lowest Price Live"
    },
    sale_end_time: {
      type: Date,
      required: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    apply_to: {
      type: String,
      enum: ["SPECIFIC_PRODUCTS", "BY_BRAND", "BY_CATEGORY", "ALL_PRODUCTS"],
      default: "SPECIFIC_PRODUCTS",
    },
    product_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    brand_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
      },
    ],
    category_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

dealCampaignSchema.index({ is_active: 1, sale_end_time: 1 });

const DealCampaign = mongoose.model("DealCampaign", dealCampaignSchema);
module.exports = DealCampaign;
