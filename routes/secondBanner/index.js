const express = require("express");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const SecondBannerController = require("../../controllers/secondBanner/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");

const router = express.Router();
const upload = multer({ storage: storage });

const uploadBannerFile = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) return next(err);
    if (req.files && req.files.length > 0) {
      req.file =
        req.files.find(
          (f) => f.fieldname === "banner_image" || f.fieldname === "image"
        ) || req.files[0];
    }
    next();
  });
};

// Public endpoints (must be above "/:id")
router.get("/active", SecondBannerController.getActiveBanner);
router.get("/active/all", SecondBannerController.getActiveBannersList);

// Admin endpoints
router.get("/", adminOrSuperAdmin, SecondBannerController.getAllBanners);
router.post(
  "/",
  adminOrSuperAdmin,
  uploadBannerFile,
  SecondBannerController.createBanner
);
router.get("/:id", adminOrSuperAdmin, SecondBannerController.getBannerById);
router.put(
  "/:id",
  adminOrSuperAdmin,
  uploadBannerFile,
  SecondBannerController.updateBanner
);
router.delete("/:id", adminOrSuperAdmin, SecondBannerController.deleteBanner);

module.exports = router;
