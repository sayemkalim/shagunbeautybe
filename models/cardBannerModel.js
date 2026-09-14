const mongoose = require("mongoose");

const CardBannerSchema = new mongoose.Schema(
  {
    banner_url: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      trim: true,
      default: "",
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    // Single product compatibility (first product in list)
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    // Banner ya Card ka option (true/false)
    is_card: {
      type: Boolean,
      default: false,
    },
    is_banner: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
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

CardBannerSchema.index({ is_active: 1, order: 1 });
CardBannerSchema.index({ is_card: 1, is_active: 1 });

const CardBanner = mongoose.model("CardBanner", CardBannerSchema);
module.exports = CardBanner;
