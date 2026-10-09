const express = require("express");
const DealCampaignController = require("../../controllers/dealCampaign/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

// Public / App Storefront routes (must stay above "/:id")
router.get("/active", DealCampaignController.getActiveDealCampaigns);
router.get("/for-product/:productId", DealCampaignController.getCampaignForProduct);

// Admin Management routes
router.get("/", adminOrSuperAdmin, DealCampaignController.getAllDealCampaigns);
router.post("/", adminOrSuperAdmin, DealCampaignController.createDealCampaign);
router.get("/:id", adminOrSuperAdmin, DealCampaignController.getDealCampaignById);
router.put("/:id", adminOrSuperAdmin, DealCampaignController.updateDealCampaign);
router.patch(
  "/:id/toggle-status",
  adminOrSuperAdmin,
  DealCampaignController.toggleDealCampaignStatus
);
router.delete("/:id", adminOrSuperAdmin, DealCampaignController.deleteDealCampaign);

module.exports = router;
