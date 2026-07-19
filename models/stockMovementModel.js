const mongoose = require("mongoose");

const StockMovementSchema = new mongoose.Schema(
  {
    inventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "restock",
        "sale",
        "return",
        "adjustment",
        "damage",
        "order_cancelled",
      ],
      required: true,
    },
    quantity_change: {
      type: Number,
      required: true,
    },
    quantity_before: {
      type: Number,
      required: true,
    },
    quantity_after: {
      type: Number,
      required: true,
    },
    reference_type: {
      type: String,
      enum: ["order", "manual", "import"],
      default: "manual",
    },
    reference_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    note: {
      type: String,
      default: "",
    },
    created_by_admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

StockMovementSchema.index({ sku: 1, createdAt: -1 });
StockMovementSchema.index({ product: 1, createdAt: -1 });

const StockMovement = mongoose.model("StockMovement", StockMovementSchema);

module.exports = StockMovement;
