const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema(
  {
    banner_url: {
      type: String,
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
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
