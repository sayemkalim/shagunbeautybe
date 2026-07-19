const { asyncHandler } = require("../../common/asyncHandler");
const ApiResponse = require("../../utils/ApiResponse");
const InventoryService = require("../../services/inventory/index.js");

const listInventory = asyncHandler(async (req, res) => {
  const { page = 1, per_page = 50, search = "", filter = "all" } = req.query;
  const result = await InventoryService.listInventory({
    page: parseInt(page, 10),
    per_page: parseInt(per_page, 10),
    search,
    filter,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Inventory fetched successfully", true));
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await InventoryService.getStats();
  return res
    .status(200)
    .json(new ApiResponse(200, stats, "Inventory stats fetched successfully", true));
});

const getMovements = asyncHandler(async (req, res) => {
  const { sku, product, page = 1, per_page = 50 } = req.query;
  const result = await InventoryService.listMovements({
    sku,
    product,
    page: parseInt(page, 10),
    per_page: parseInt(per_page, 10),
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Stock movements fetched successfully", true));
});

const getInventoryBySku = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  try {
    const result = await InventoryService.getBySku(sku);
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Inventory fetched successfully", true));
  } catch (error) {
    return res.status(404).json(new ApiResponse(404, null, error.message, false));
  }
});

const restock = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  const { quantity, note } = req.body;
  try {
    const result = await InventoryService.restockBySku({
      sku,
      quantity: Number(quantity),
      note,
      adminId: req.admin._id,
    });
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Stock restocked successfully", true));
  } catch (error) {
    return res.status(400).json(new ApiResponse(400, null, error.message, false));
  }
});

const adjustStock = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  const { quantityChange, note } = req.body;
  try {
    const result = await InventoryService.adjustStockBySku({
      sku,
      quantityChange: Number(quantityChange),
      note,
      adminId: req.admin._id,
    });
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Stock adjusted successfully", true));
  } catch (error) {
    return res.status(400).json(new ApiResponse(400, null, error.message, false));
  }
});

const setStock = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  const { quantity, note } = req.body;
  try {
    const result = await InventoryService.setStockBySku({
      sku,
      quantity: Number(quantity),
      note,
      adminId: req.admin._id,
    });
    return res
      .status(200)
      .json(new ApiResponse(200, result, "Stock set successfully", true));
  } catch (error) {
    return res.status(400).json(new ApiResponse(400, null, error.message, false));
  }
});

const updateThreshold = asyncHandler(async (req, res) => {
  const { sku } = req.params;
  const { low_stock_threshold } = req.body;
  try {
    const inventory = await InventoryService.updateThresholdBySku(
      sku,
      Number(low_stock_threshold),
    );
    return res
      .status(200)
      .json(new ApiResponse(200, inventory, "Low stock threshold updated successfully", true));
  } catch (error) {
    return res.status(400).json(new ApiResponse(400, null, error.message, false));
  }
});

const syncFromProducts = asyncHandler(async (req, res) => {
  const result = await InventoryService.syncInventoryFromProducts(req.admin._id);
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Inventory synced from products successfully", true));
});

module.exports = {
  listInventory,
  getStats,
  getMovements,
  getInventoryBySku,
  restock,
  adjustStock,
  setStock,
  updateThreshold,
  syncFromProducts,
};
