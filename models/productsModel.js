const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    small_description: {
      type: String,
    },
    full_description: {
      type: String,
    },
    price: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    discounted_price: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
      validate: {
        validator: function (value) {
          return value === null || value >= 0;
        },
        message: "Discounted price must be a non-negative number or null",
      },
    },
    tags: {
      type: [String],
      enum: [
        "no_palm_oil",
        "organic",
        "no_gmo",
        "no_aritificial_flavors",
        "vegan",
        "sugar_free",
        "gluten_free",
        "soya_free",
        "no_preservatives",
        "lactose_free",
        "no_flavor_enhancer",
      ],
      default: [],
    },
    inventory: {
      type: Number,
      default: 0,
      enum: [0, 1],
      min: 0,
      max: 1,
    },
    status: {
      type: String,
      enum: ["published", "draft"],
      default: "draft",
    },
    weight_in_grams: {
      type: Number,
      min: 0,
      default: null,
    },
    manufacturer: {
      type: String,
    },
    consumed_type: {
      type: String,
    },
    banner_image: {
      type: String,
    },
    images: {
      type: [String],
      default: [],
    },
    expiry_date: {
      type: Date,
    },
    meta_data: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: false,
    },
    is_best_seller: {
      type: Boolean,
      default: false,
    },
    is_imported_picks: {
      type: Boolean,
      default: false,
    },
    is_bakery: {
      type: Boolean,
      default: false,
    },
    celiacFriendly: {
      type: Boolean,
      default: false,
    },
    sub_category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
    },
    created_by_admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    variants: [
      {
        sku: { type: String, required: true },
        name: { type: String },
        attributes: { type: Map, of: String },
        price: { type: mongoose.Schema.Types.Decimal128, required: true },
        discounted_price: {
          type: mongoose.Schema.Types.Decimal128,
          default: null,
        },
        inventory: { type: Number, default: 0, min: 0 },
        images: [String],
      },
    ],
  },
  { timestamps: true }
);

ProductSchema.set("toJSON", {
  transform: (_, ret) => {
    if (ret.price) ret.price = parseFloat(ret.price.toString());
    if (ret.discounted_price)
      ret.discounted_price = parseFloat(ret.discounted_price.toString());
    if (Array.isArray(ret.variants)) {
      ret.variants = ret.variants.map((variant) => ({
        ...variant,
        price: variant.price
          ? parseFloat(variant.price.toString())
          : variant.price,
        discounted_price: variant.discounted_price
          ? parseFloat(variant.discounted_price.toString())
          : variant.discounted_price,
      }));
    }
    return ret;
  },
});

ProductSchema.pre("validate", function (next) {
  if (Array.isArray(this.variants)) {
    const skus = this.variants.map((v) => v.sku);
    const uniqueSkus = new Set(skus);
    if (skus.length !== uniqueSkus.size) {
      return next(
        new Error("Each variant sku must be unique within the product.")
      );
    }
  }
  next();
});

const Product = mongoose.model("Product", ProductSchema);

module.exports = Product;
