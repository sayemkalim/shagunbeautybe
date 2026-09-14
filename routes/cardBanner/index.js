const express = require("express");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const CardBannerController = require("../../controllers/cardBanner/index.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");

const router = express.Router();
const upload = multer({ storage: storage });

const uploadCardBanner = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) return next(err);
    if (req.files && req.files.length > 0) {
      req.file =
        req.files.find(
          (f) =>
            f.fieldname === "banner_image" ||
            f.fieldname === "image" ||
            f.fieldname === "card_image"
        ) || req.files[0];
    }
    next();
  });
};

// Public: storefront & mobile active card banners (must be above /:id)
router.get("/active", CardBannerController.getActiveCardBanners);

// Admin management
router.get("/", adminOrSuperAdmin, CardBannerController.getAllCardBanners);
router.post(
  "/",
  adminOrSuperAdmin,
  uploadCardBanner,
  CardBannerController.createCardBanner
);
router.get("/:id", adminOrSuperAdmin, CardBannerController.getCardBannerById);
router.put(
  "/:id",
  adminOrSuperAdmin,
  uploadCardBanner,
  CardBannerController.updateCardBanner
);
router.delete("/:id", adminOrSuperAdmin, CardBannerController.deleteCardBanner);

module.exports = router;
