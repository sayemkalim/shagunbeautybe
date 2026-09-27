const parseDecimal = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  return parseFloat(value.toString());
};

const getProductBasePrice = (product) =>
  product.discounted_price !== null && product.discounted_price !== undefined
    ? parseDecimal(product.discounted_price)
    : parseDecimal(product.price);

const hasPriceTiers = (product) =>
  Array.isArray(product?.price_tiers) && product.price_tiers.length > 0;

/**
 * The purchasable quantity/price menu for a base product or variant that HAS bulk price tiers defined.
 * qty=1 is always implicitly priced at discounted_price (falling back to price) — price_tiers only
 * carry the additional bulk pack sizes (qty >= 2).
 */
const getProductQuantityOptions = (product) => {
  if (!product) return [];
  const options = [{ quantity: 1, price: getProductBasePrice(product) }];

  if (Array.isArray(product.price_tiers)) {
    for (const tier of product.price_tiers) {
      options.push({ quantity: tier.quantity, price: parseDecimal(tier.price) });
    }
  }

  return options.sort((a, b) => a.quantity - b.quantity);
};

/**
 * Resolves the per-unit price for a base product or variant at a given quantity.
 * - No price_tiers defined: any positive integer quantity is allowed at the flat base price.
 * - price_tiers defined: if quantity matches a defined tier, that tier's price is returned;
 *   otherwise falls back to the base price.
 */
const resolveProductUnitPrice = (product, quantity) => {
  if (!product || !Number.isInteger(quantity) || quantity < 1) return null;

  if (hasPriceTiers(product)) {
    const match = getProductQuantityOptions(product).find(
      (option) => option.quantity === quantity
    );
    if (match) {
      return match.price;
    }
  }

  return getProductBasePrice(product);
};

module.exports = {
  hasPriceTiers,
  getProductQuantityOptions,
  resolveProductUnitPrice,
  // Variant helper aliases
  hasVariantPriceTiers: hasPriceTiers,
  getVariantQuantityOptions: getProductQuantityOptions,
  resolveVariantUnitPrice: resolveProductUnitPrice,
};
