const parseDecimal = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  return parseFloat(value.toString());
};

const getProductBasePrice = (product) =>
  product.discounted_price !== null && product.discounted_price !== undefined
    ? parseDecimal(product.discounted_price)
    : parseDecimal(product.price);

const hasPriceTiers = (product) =>
  Array.isArray(product.price_tiers) && product.price_tiers.length > 0;

/**
 * The purchasable quantity/price menu for a base (non-variant) product that HAS bulk price tiers defined.
 * qty=1 is always implicitly priced at discounted_price (falling back to price) — price_tiers only
 * carry the additional bulk pack sizes (qty >= 2). Not meaningful for products with no tiers — see
 * resolveProductUnitPrice for that case (any quantity is allowed there).
 */
const getProductQuantityOptions = (product) => {
  const options = [{ quantity: 1, price: getProductBasePrice(product) }];

  if (Array.isArray(product.price_tiers)) {
    for (const tier of product.price_tiers) {
      options.push({ quantity: tier.quantity, price: parseDecimal(tier.price) });
    }
  }

  return options.sort((a, b) => a.quantity - b.quantity);
};

/**
 * Resolves the per-unit price for a base (non-variant) product at a given quantity.
 * - No price_tiers defined (the vast majority of existing products): any positive integer quantity
 *   is allowed at the flat base price — identical to the pre-tiered-pricing behavior.
 * - price_tiers defined: quantity must exactly match qty=1 or one of the defined tier quantities;
 *   returns null for anything else (caller should reject).
 */
const resolveProductUnitPrice = (product, quantity) => {
  if (!hasPriceTiers(product)) {
    return Number.isInteger(quantity) && quantity >= 1
      ? getProductBasePrice(product)
      : null;
  }

  const match = getProductQuantityOptions(product).find(
    (option) => option.quantity === quantity
  );
  return match ? match.price : null;
};

module.exports = {
  hasPriceTiers,
  getProductQuantityOptions,
  resolveProductUnitPrice,
};
