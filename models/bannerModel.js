const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema(
  {
    banner_url: {
      type: String,
      required: true,
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    // Retained for backward compatibility with storefront / legacy consumers
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    // Controls display order in the storefront carousel (ascending)
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

BannerSchema.index({ is_active: 1, order: 1 });

const Banner = mongoose.model("Banner", BannerSchema);
module.exports = Banner;
