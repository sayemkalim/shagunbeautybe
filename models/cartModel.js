const mongoose = require("mongoose");

const CartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        type: {
          type: String,
          enum: ["product", "bundle"],
          required: true,
        },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: function() { return this.type === "product"; },
        },
        bundle: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Bundle",
          required: function() { return this.type === "bundle"; },
        },
        variant_sku: {
          type: String,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        total: {
          type: Number,
          required: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    total_price: {
      type: Number,
      required: true,
      default: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

CartSchema.pre("save", function (next) {
  // Ensure all items have proper totals
  this.items.forEach((item) => {
    // Only recalculate total if we have both quantity and price, and price is not 0
    if (item.quantity && item.price && item.price > 0) {
      item.total = item.quantity * item.price;
    }
    // Update timestamps
    item.updatedAt = new Date();
  });

  // Calculate total price
  this.total_price = this.items.reduce((sum, item) => sum + (item.total || 0), 0);
  
  // Update cart active status
  this.is_active = this.items.length > 0;

  next();
});

const Cart = mongoose.model("Cart", CartSchema);
module.exports = Cart;
