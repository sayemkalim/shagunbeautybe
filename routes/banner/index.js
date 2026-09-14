const express = require("express");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const BannerController = require("../../controllers/banner/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const secondBannerRoutes = require("../secondBanner/index.js");
const router = express.Router();

const upload = multer({ storage: storage });

// Second Banner sub-routes under /api/banner/second
router.use("/second", secondBannerRoutes);
router.use("/second-banner", secondBannerRoutes);

// Public (must stay above "/:id" below, or "/active" gets swallowed as an id)
router.get("/active", BannerController.getActiveBanners);

// Admin management
router.get("/", adminOrSuperAdmin, BannerController.getAllBanners);
router.post(
  "/",
  adminOrSuperAdmin,
  upload.single("banner_image"),
  BannerController.createBanner
);
router.get("/:id", adminOrSuperAdmin, BannerController.getBannerById);
router.put(
  "/:id",
  adminOrSuperAdmin,
  upload.single("banner_image"),
  BannerController.updateBanner
);
router.delete("/:id", adminOrSuperAdmin, BannerController.deleteBanner);

module.exports = router;
