const express = require("express");
const DeliveryZoneController = require("../../controllers/delivery_zone/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

router.get("/calculate", DeliveryZoneController.calculateDeliveryPrice);

router.post(
  "/check-duplicates",
  adminOrSuperAdmin,
  DeliveryZoneController.checkDuplicatePincodes
);

router.get("/", adminOrSuperAdmin, DeliveryZoneController.getAllDeliveryZones);

router.post("/", adminOrSuperAdmin, DeliveryZoneController.createDeliveryZone);

router.get(
  "/:id",
  adminOrSuperAdmin,
  DeliveryZoneController.getDeliveryZoneById
);

router.put(
  "/:id",
  adminOrSuperAdmin,
  DeliveryZoneController.updateDeliveryZone
);

router.delete(
  "/:id",
  adminOrSuperAdmin,
  DeliveryZoneController.deleteDeliveryZone
);

router.put(
  "/:id/set-default",
  adminOrSuperAdmin,
  DeliveryZoneController.setDefaultZone
);

module.exports = router;
