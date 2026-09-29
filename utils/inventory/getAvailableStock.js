/**
 * Resolves available stock independently for Base Product vs Variant.
 *
 * Case A: User selected a specific Variant (Size / Shade / Weight) -> returns that variant's independent stock.
 * Case B: User selected Base Product (No variant specified) -> returns Base Product's independent stock.
 *
 * @param {Object} product - Product document / object
 * @param {string|null} variantSku - Variant SKU or variant _id
 * @returns {number} Available stock quantity
 */
function getAvailableStock(product, variantSku) {
  if (!product) return 0;

  // Case A: User ne specific Variant chuna hai (Size / Shade / Weight)
  if (variantSku && Array.isArray(product.variants) && product.variants.length > 0) {
    const variant = product.variants.find(
      (v) => v.sku === variantSku || String(v._id) === String(variantSku)
    );
    if (variant) {
      if (variant.status === "Out Of Stock" || variant.is_out_of_stock === true) {
        return 0;
      }
      // Sirf us variant ka apna independent stock return hoga
      return Number(
        variant.available_inventory ??
          variant.qty_on_hand ??
          variant.inventory ??
          0
      );
    }
  }

  // Case B: User ne Base Product chuna hai (Bina variant wala product)
  if (product.status === "Out Of Stock" || product.is_out_of_stock === true) {
    return 0;
  }

  if (
    product.base_available_inventory !== undefined &&
    product.base_available_inventory !== null
  ) {
    return Number(product.base_available_inventory);
  }

  return Number(
    product.available_inventory ??
      product.qty_on_hand ??
      product.inventory ??
      0
  );
}

module.exports = {
  getAvailableStock,
};
