const mongoose = require("mongoose");

const CodSettingSchema = new mongoose.Schema(
  {
    is_cod_enabled: {
      type: Boolean,
      default: true,
    },
    min_order_amount: {
      type: Number,
      default: 1, // Default minimum amount in INR
      min: 0,
    },
    max_order_amount: {
      type: Number,
      default: 2000, // Default maximum amount in INR (Rs 1 to 2000)
      min: 0,
    },
    allowed_pincodes: {
      type: [String],
      default: ["206001"], // Default allowed pincode: 206001
    },
    allow_all_pincodes: {
      type: Boolean,
      default: false,
    },
    cod_extra_charge: {
      type: Number,
      default: 0,
      min: 0,
    },
    description: {
      type: String,
      default: "Cash on Delivery Settings",
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

const CodSetting = mongoose.model("CodSetting", CodSettingSchema);
module.exports = CodSetting;
