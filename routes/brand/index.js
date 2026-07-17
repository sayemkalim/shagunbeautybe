const express = require("express");
const BrandController = require("../../controllers/brand/index.js");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

const upload = multer({ storage: storage });

// User Routes
router.post(
  "/",
  adminOrSuperAdmin,
  upload.array("images"),
  BrandController.createBrand
);
router.get("/", BrandController.getAllBrands);

// Admin Routes
router.get("/admin", adminOrSuperAdmin, BrandController.getBrandsByAdmin);
router.put(
  "/:id",
  adminOrSuperAdmin,
  upload.array("images"),
  BrandController.updateBrand
);
router.get("/:id", adminOrSuperAdmin, BrandController.getBrandById);
router.delete("/:id", adminOrSuperAdmin, BrandController.deleteBrand);

module.exports = router;
