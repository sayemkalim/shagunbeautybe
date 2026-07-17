const mongoose = require("mongoose");
const Counter = require("./counterModel.js");

const OrderItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["product", "bundle"],
    required: true,
  },
  product: {
    type: new mongoose.Schema({
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: function() { return this.type === "product"; }
      },
      name: String,
      price: mongoose.Schema.Types.Decimal128,
      discounted_price: mongoose.Schema.Types.Decimal128,
      banner_image: String,
      sub_category: mongoose.Schema.Types.ObjectId,
    }),
    required: function() { return this.type === "product"; }
  },
  bundle: {
    type: new mongoose.Schema({
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: function() { return this.type === "bundle"; }
      },
      name: String,
      price: mongoose.Schema.Types.Decimal128,
      discounted_price: mongoose.Schema.Types.Decimal128,
      images: [String],
      description: String,
      products: [
        {
          product: mongoose.Schema.Types.ObjectId,
          variant_sku: String,
          quantity: Number,
        }
      ],
    }),
    required: function() { return this.type === "bundle"; }
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  total_amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  discounted_total_amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  }
});

const OrderAddressSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  pincode: String,
  locality: String,
  address: String,
  city: String,
  state: String,
  landmark: String,
  alternatePhone: String,
  addressType: String
});

const OrderSchema = new mongoose.Schema({
  orderNumber: {
    type: Number,
    unique: true,
    sparse: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
    default: null
  },
  isGuestOrder: {
    type: Boolean,
    default: false
  },
  guestInfo: {
    email: {
      type: String,
      default: null
    },
    name: {
      type: String,
      default: null
    },
    mobile: {
      type: String,
      default: null
    }
  },
  items: [OrderItemSchema],
  address: OrderAddressSchema,
  totalAmount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  discountedTotalAmount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  shippingCost: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0
  },
  shippingDetails: {
    deliveryZoneId: mongoose.Schema.Types.ObjectId,
    zoneName: String,
    pricingType: String,
    isManual: {
      type: Boolean,
      default: false
    },
    calculatedAt: Date
  },
  finalTotalAmount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  emailTracking: {
    confirmation: {
      status: { 
        type: String, 
        enum: ["queued", "sent", "delivered", "bounced", "failed"],
        default: "queued"
      },
      queuedAt: { type: Date },
      sentAt: { type: Date },
      deliveredAt: { type: Date },
      bouncedAt: { type: Date },
      failedAt: { type: Date },
      opened: { type: Boolean, default: false },
      openedAt: { type: Date },
      openCount: { type: Number, default: 0 },
      clicked: { type: Boolean, default: false },
      clickedAt: { type: Date },
      clickCount: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
      lastAttemptAt: { type: Date },
      error: { type: String },
      bounceReason: { type: String }
    },
    statusUpdates: [
      {
        status: String,
        emailStatus: { 
          type: String, 
          enum: ["queued", "sent", "delivered", "bounced", "failed"],
          default: "queued"
        },
        queuedAt: { type: Date },
        sentAt: { type: Date },
        deliveredAt: { type: Date },
        bouncedAt: { type: Date },
        failedAt: { type: Date },
        opened: { type: Boolean, default: false },
        openedAt: { type: Date },
        openCount: { type: Number, default: 0 },
        clicked: { type: Boolean, default: false },
        clickedAt: { type: Date },
        clickCount: { type: Number, default: 0 },
        attempts: { type: Number, default: 0 },
        lastAttemptAt: { type: Date },
        error: { type: String },
        bounceReason: { type: String }
      }
    ]
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
    default: "pending"
  },
  paymentLink: {
    type: String,
    default: null
  },
  paymentLinkId: {
    type: String,
    default: null
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "cancelled"],
    default: "pending"
  },
  paymentId: {
    type: String,
    default: null
  },
  paymentMethod: {
    type: String,
    default: null
  },
  paidAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

OrderSchema.pre("save", async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: "orderNumber" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.orderNumber = counter.seq;
  }
  next();
});

OrderSchema.set("toJSON", {
  transform: (doc, ret) => {
    // Convert totalAmount and discountedTotalAmount to number with null checks
    if (ret.totalAmount) {
      ret.totalAmount = parseFloat(ret.totalAmount.toString());
    }
    if (ret.discountedTotalAmount) {
      ret.discountedTotalAmount = parseFloat(ret.discountedTotalAmount.toString());
    }
    if (ret.shippingCost) {
      ret.shippingCost = parseFloat(ret.shippingCost.toString());
    }
    if (ret.finalTotalAmount) {
      ret.finalTotalAmount = parseFloat(ret.finalTotalAmount.toString());
    }

    // Ensure ret.items is an array before mapping
    if (Array.isArray(ret.items)) {
      ret.items = ret.items.map(item => {
        if (item.type === "product" && item.product) {
          return {
            ...item,
            product: {
              ...item.product,
              price: item.product.price ? parseFloat(item.product.price.toString()) : null,
              discounted_price: item.product.discounted_price
                ? parseFloat(item.product.discounted_price.toString())
                : null
            },
            total_amount: item.total_amount ? parseFloat(item.total_amount.toString()) : null,
            discounted_total_amount: item.discounted_total_amount ? parseFloat(item.discounted_total_amount.toString()) : null
          };
        } else if (item.type === "bundle" && item.bundle) {
          return {
            ...item,
            bundle: {
              ...item.bundle,
              price: item.bundle.price ? parseFloat(item.bundle.price.toString()) : null,
              discounted_price: item.bundle.discounted_price
                ? parseFloat(item.bundle.discounted_price.toString())
                : null
            },
            total_amount: item.total_amount ? parseFloat(item.total_amount.toString()) : null,
            discounted_total_amount: item.discounted_total_amount ? parseFloat(item.discounted_total_amount.toString()) : null
          };
        }
        return item;
      });
    }

    return ret;
  }
});

module.exports = mongoose.model("Order", OrderSchema);
