const mongoose = require("mongoose");

const InventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variant_sku: {
      type: String,
      default: null,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    quantity_on_hand: {
      type: Number,
      default: 0,
      min: 0,
    },
    reserved_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    low_stock_threshold: {
      type: Number,
      default: 10,
      min: 0,
    },
    last_restocked_at: {
      type: Date,
      default: null,
    },
    created_by_admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

InventorySchema.index({ product: 1, variant_sku: 1 }, { unique: true });

const Inventory = mongoose.model("Inventory", InventorySchema);

module.exports = Inventory;
