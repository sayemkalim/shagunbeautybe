const Product = require("../models/productsModel");

// Uppercase, strip anything that isn't alphanumeric, cap length so tokens stay readable.
const buildSkuToken = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 20);
};

// Builds the unsuffixed candidate sku from the product's base sku + variant
// attributes (preferred) or color/weight_in_grams as a fallback when no
// generic attributes map was given.
const buildVariantSkuBase = (baseSku, variant = {}) => {
  const tokens = [];

  const attributes = variant.attributes;
  if (attributes) {
    const values =
      typeof attributes.values === "function"
        ? Array.from(attributes.values())
        : Object.values(attributes);
    for (const value of values) {
      const token = buildSkuToken(value);
      if (token) tokens.push(token);
    }
  }

  if (!tokens.length) {
    const colorToken = buildSkuToken(variant.color);
    if (colorToken) tokens.push(colorToken);

    if (variant.weight_in_grams !== undefined && variant.weight_in_grams !== null) {
      const weightToken = buildSkuToken(`${variant.weight_in_grams}G`);
      if (weightToken) tokens.push(weightToken);
    }
  }

  const base = String(baseSku).trim().toUpperCase();
  return tokens.length ? `${base}-${tokens.join("-")}` : base;
};

// Loads every sku currently in use (product skus + variant skus) as an
// uppercased Set. Callers should add() into this set as they reserve new
// skus within the same batch so siblings in one request don't collide.
const loadTakenSkus = async () => {
  const products = await Product.find({}, { sku: 1, "variants.sku": 1 }).lean();
  const taken = new Set();
  for (const product of products) {
    if (product.sku) taken.add(String(product.sku).toUpperCase());
    for (const variant of product.variants || []) {
      if (variant.sku) taken.add(String(variant.sku).toUpperCase());
    }
  }
  return taken;
};

// Builds a candidate sku and appends -2, -3, ... until it's free in takenSkus,
// then reserves it in the set before returning.
const generateUniqueVariantSku = (baseSku, variant, takenSkus) => {
  const base = buildVariantSkuBase(baseSku, variant);
  let candidate = base;
  let suffix = 2;
  while (takenSkus.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  takenSkus.add(candidate);
  return candidate;
};

module.exports = {
  buildSkuToken,
  buildVariantSkuBase,
  loadTakenSkus,
  generateUniqueVariantSku,
};
