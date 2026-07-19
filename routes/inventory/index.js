const express = require("express");
const InventoryController = require("../../controllers/inventory/index.js");
const {
  adminOrSuperAdmin,
  adminOrSubAdminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

router.get("/", adminOrSubAdminOrSuperAdmin, InventoryController.listInventory);
router.get("/stats", adminOrSubAdminOrSuperAdmin, InventoryController.getStats);
router.get("/movements", adminOrSubAdminOrSuperAdmin, InventoryController.getMovements);
router.post("/sync", adminOrSuperAdmin, InventoryController.syncFromProducts);

router.get("/:sku", adminOrSubAdminOrSuperAdmin, InventoryController.getInventoryBySku);
router.patch("/:sku/adjust", adminOrSuperAdmin, InventoryController.adjustStock);
router.patch("/:sku/set", adminOrSuperAdmin, InventoryController.setStock);
router.patch("/:sku/threshold", adminOrSuperAdmin, InventoryController.updateThreshold);
router.post("/:sku/restock", adminOrSuperAdmin, InventoryController.restock);

module.exports = router;
