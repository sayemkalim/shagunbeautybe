const mongoose = require("mongoose");

const SubCategorySchema = new mongoose.Schema(
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
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    meta_data: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    images: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

const SubCategory = mongoose.model("SubCategory", SubCategorySchema);
module.exports = SubCategory;
