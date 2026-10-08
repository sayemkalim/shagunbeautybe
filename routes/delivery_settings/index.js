const express = require("express");
const DeliverySettingsController = require("../../controllers/delivery_settings/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");

const router = express.Router();

// Public / Mobile / Web check endpoint
router.get("/calculate", DeliverySettingsController.calculateDeliveryFee);

// Public / Client read settings
router.get("/", DeliverySettingsController.getDeliverySettings);

// Admin update settings
router.post("/", adminOrSuperAdmin, DeliverySettingsController.updateDeliverySettings);
router.put("/", adminOrSuperAdmin, DeliverySettingsController.updateDeliverySettings);

module.exports = router;
