const Product = require("../../models/productsModel");
const InventoryRepository = require("../../repositories/inventory/index.js");

const resolveBaseSkuForProduct = async (productId) => {
  const product = await Product.findById(productId).select("sku").lean();
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }
  return product.sku;
};

// Order items only persist which base product was bought, not which variant —
// so sku resolution for a bare "product" order line always falls back to the
// product's own sku. Only bundle component lines carry variant_sku.
const resolveProductAndVariantBySku = async (sku) => {
  const existing = await InventoryRepository.findBySku(sku);
  if (existing) {
    return { productId: existing.product, variantSku: existing.variant_sku };
  }

  const baseMatch = await Product.findOne({ sku }).select("_id").lean();
  if (baseMatch) {
    return { productId: baseMatch._id, variantSku: null };
  }

  const variantMatch = await Product.findOne({ "variants.sku": sku })
    .select("_id")
    .lean();
  if (variantMatch) {
    return { productId: variantMatch._id, variantSku: sku };
  }

  throw new Error(`SKU not found: ${sku}`);
};

const ensureInventoryRecord = async ({ productId, variantSku, sku, adminId = null }) => {
  const existing = await InventoryRepository.findByProductAndVariant(
    productId,
    variantSku,
  );
  if (existing) return existing;

  try {
    return await InventoryRepository.createInventory({
      product: productId,
      variant_sku: variantSku,
      sku,
      created_by_admin: adminId,
    });
  } catch (error) {
    if (error.code === 11000) {
      const refetched = await InventoryRepository.findByProductAndVariant(
        productId,
        variantSku,
      );
      if (refetched) return refetched;
      throw new Error(
        `SKU "${sku}" is already tracked under a different product/variant`,
      );
    }
    throw error;
  }
};

// Core mutator. Positive quantityChange adds stock, negative removes it.
// allowNegative=true clamps at 0 instead of throwing (used for best-effort
// order-driven deductions, which never block checkout).
const adjustStock = async ({
  productId,
  variantSku = null,
  quantityChange,
  type,
  note = "",
  adminId = null,
  referenceType = "manual",
  referenceId = null,
  allowNegative = false,
}) => {
  if (!Number.isFinite(quantityChange) || quantityChange === 0) {
    throw new Error("quantityChange must be a non-zero number");
  }

  const sku = variantSku || (await resolveBaseSkuForProduct(productId));
  const inventory = await ensureInventoryRecord({
    productId,
    variantSku,
    sku,
    adminId,
  });

  const quantityBefore = inventory.quantity_on_hand;
  const rawAfter = quantityBefore + quantityChange;

  let quantityAfter = rawAfter;
  let finalNote = note;
  if (rawAfter < 0) {
    if (!allowNegative) {
      throw new Error(
        `Insufficient stock for SKU "${sku}": have ${quantityBefore}, requested change ${quantityChange}`,
      );
    }
    quantityAfter = 0;
    finalNote = note
      ? `${note} (clamped: insufficient stock)`
      : "clamped: insufficient stock";
  }

  const extra = {};
  if (type === "restock") extra.last_restocked_at = new Date();

  const updatedInventory = await InventoryRepository.updateQuantity(
    inventory._id,
    quantityAfter,
    extra,
  );

  const movement = await InventoryRepository.createMovement({
    inventory: inventory._id,
    sku,
    product: productId,
    type,
    quantity_change: quantityAfter - quantityBefore,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
    reference_type: referenceType,
    reference_id: referenceId,
    note: finalNote,
    created_by_admin: adminId,
  });

  return { inventory: updatedInventory, movement };
};

const restockBySku = async ({ sku, quantity, note = "", adminId = null }) => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive number");
  }
  const { productId, variantSku } = await resolveProductAndVariantBySku(sku);
  return adjustStock({
    productId,
    variantSku,
    quantityChange: quantity,
    type: "restock",
    note,
    adminId,
    referenceType: "manual",
  });
};

const adjustStockBySku = async ({
  sku,
  quantityChange,
  note = "",
  adminId = null,
}) => {
  if (!Number.isFinite(quantityChange) || quantityChange === 0) {
    throw new Error("quantityChange must be a non-zero number");
  }
  const { productId, variantSku } = await resolveProductAndVariantBySku(sku);
  return adjustStock({
    productId,
    variantSku,
    quantityChange,
    type: "adjustment",
    note,
    adminId,
    referenceType: "manual",
  });
};

const setStockBySku = async ({ sku, quantity, note = "", adminId = null }) => {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative number");
  }
  const { productId, variantSku } = await resolveProductAndVariantBySku(sku);
  const inventory = await ensureInventoryRecord({ productId, variantSku, sku, adminId });
  const quantityChange = quantity - inventory.quantity_on_hand;
  if (quantityChange === 0) {
    return { inventory, movement: null };
  }
  return adjustStock({
    productId,
    variantSku,
    quantityChange,
    type: "adjustment",
    note: note || "manual stock correction",
    adminId,
    referenceType: "manual",
    allowNegative: true,
  });
};

const updateThresholdBySku = async (sku, lowStockThreshold) => {
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
    throw new Error("low_stock_threshold must be a non-negative number");
  }
  const updated = await InventoryRepository.updateThreshold(sku, lowStockThreshold);
  if (!updated) {
    throw new Error(`SKU not found: ${sku}`);
  }
  return updated;
};

const getBySku = async (sku) => {
  const inventory = await InventoryRepository.findBySku(sku);
  if (!inventory) {
    throw new Error(`SKU not found: ${sku}`);
  }
  const { data: recentMovements } = await InventoryRepository.listMovements({
    sku,
    page: 1,
    per_page: 10,
  });
  return { inventory, recentMovements };
};

const listInventory = async (params) => InventoryRepository.listInventory(params);

const listMovements = async (params) => InventoryRepository.listMovements(params);

const getStats = async () => {
  const stats = await InventoryRepository.getStatsAggregation();
  const recentMovements = await InventoryRepository.getRecentMovements(10);
  return { ...stats, recent_movements: recentMovements };
};

// Applies a stock movement for every line in an order. direction: -1 to
// deduct (sale), +1 to restore (cancellation). Best-effort — a missing
// product or an insufficient-stock situation is logged, not thrown, so it
// never blocks the order lifecycle that triggered it.
const applyOrderItemsAdjustment = async (order, direction) => {
  const type = direction < 0 ? "sale" : "order_cancelled";

  for (const item of order.items || []) {
    try {
      if (item.type === "product" && item.product && item.product._id) {
        await adjustStock({
          productId: item.product._id,
          variantSku: null,
          quantityChange: direction * item.quantity,
          type,
          referenceType: "order",
          referenceId: order._id,
          allowNegative: true,
        });
      } else if (
        item.type === "bundle" &&
        item.bundle &&
        Array.isArray(item.bundle.products)
      ) {
        for (const component of item.bundle.products) {
          if (!component.product) continue;
          const componentQty = (component.quantity || 1) * item.quantity;
          await adjustStock({
            productId: component.product,
            variantSku: component.variant_sku || null,
            quantityChange: direction * componentQty,
            type,
            referenceType: "order",
            referenceId: order._id,
            allowNegative: true,
          });
        }
      }
    } catch (error) {
      console.error(
        `Inventory ${direction < 0 ? "deduction" : "restore"} failed for order ${order._id}, item:`,
        error.message,
      );
    }
  }
};

const deductForOrder = async (order) => applyOrderItemsAdjustment(order, -1);

const restoreForCancelledOrder = async (order) =>
  applyOrderItemsAdjustment(order, 1);

const syncInventoryFromProducts = async (adminId = null) => {
  const products = await Product.find({}).select("_id sku variants").lean();
  let created = 0;
  let skipped = 0;
  const conflicts = [];

  for (const product of products) {
    try {
      const existing = await InventoryRepository.findByProductAndVariant(
        product._id,
        null,
      );
      if (existing) {
        skipped++;
      } else {
        await InventoryRepository.createInventory({
          product: product._id,
          variant_sku: null,
          sku: product.sku,
          created_by_admin: adminId,
        });
        created++;
      }
    } catch (error) {
      conflicts.push({ sku: product.sku, error: error.message });
    }

    for (const variant of product.variants || []) {
      try {
        const existingVariant = await InventoryRepository.findByProductAndVariant(
          product._id,
          variant.sku,
        );
        if (existingVariant) {
          skipped++;
        } else {
          await InventoryRepository.createInventory({
            product: product._id,
            variant_sku: variant.sku,
            sku: variant.sku,
            created_by_admin: adminId,
          });
          created++;
        }
      } catch (error) {
        conflicts.push({ sku: variant.sku, error: error.message });
      }
    }
  }

  return { total_products: products.length, created, skipped, conflicts };
};

module.exports = {
  resolveProductAndVariantBySku,
  ensureInventoryRecord,
  adjustStock,
  restockBySku,
  adjustStockBySku,
  setStockBySku,
  updateThresholdBySku,
  getBySku,
  listInventory,
  listMovements,
  getStats,
  deductForOrder,
  restoreForCancelledOrder,
  syncInventoryFromProducts,
};
