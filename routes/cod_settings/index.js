const express = require("express");
const CodSettingsController = require("../../controllers/cod_settings/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");

const router = express.Router();

// Public / Mobile / Web check endpoint
router.get("/check", CodSettingsController.checkCodEligibility);
router.get("/eligibility", CodSettingsController.checkCodEligibility);

// Public / Client read settings (for checkout calculation in App)
router.get("/", CodSettingsController.getCodSettings);

// Admin update settings
router.post("/", adminOrSuperAdmin, CodSettingsController.updateCodSettings);
router.put("/", adminOrSuperAdmin, CodSettingsController.updateCodSettings);

module.exports = router;
