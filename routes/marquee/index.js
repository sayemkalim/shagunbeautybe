const express = require("express");
const MarqueeController = require("../../controllers/marquee/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

// Public: storefront & mobile marquee ticker (must stay above "/:id" below)
router.get("/active", MarqueeController.getActiveMarquees);

// Admin management
router.get("/", adminOrSuperAdmin, MarqueeController.getAllMarquees);
router.post("/", adminOrSuperAdmin, MarqueeController.createMarquee);
router.get("/:id", adminOrSuperAdmin, MarqueeController.getMarqueeById);
router.put("/:id", adminOrSuperAdmin, MarqueeController.updateMarquee);
router.delete("/:id", adminOrSuperAdmin, MarqueeController.deleteMarquee);

module.exports = router;
