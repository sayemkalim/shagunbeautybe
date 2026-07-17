const mongoose = require("mongoose");

const BrandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 255,
    },
    description: {
      type: String,
      maxlength: 2056,
    },
    meta_data: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    newly_launched: {
      type: Boolean,
      default: false,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    images: {
      type: [String],
      default: [],
    },
    slug: {
      type: String,
      maxlength: 255,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

const Brand = mongoose.model("Brand", BrandSchema);
module.exports = Brand;
