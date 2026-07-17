const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
    mobile: {
      type: String,
      required: true,
      maxlength: 20,
    },
    pincode: {
      type: String,
      required: true,
      maxlength: 20,
    },
    // locality: {
    //   type: String,
    //   required: true,
    //   maxlength: 255,
    // },
    address: {
      type: String,
      required: true,
      maxlength: 500,
    },
    city: {
      type: String,
      required: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: true,
      maxlength: 100,
    },
    // landmark: {
    //   type: String,
    //   maxlength: 255,
    // },
    // alternatePhone: {
    //   type: String,
    //   maxlength: 20,
    // },
    // addressType: {
    //   type: String,
    //   enum: ["home", "work", "other"],
    //   required: true,
    // },
    isPrimary: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Address", AddressSchema);
