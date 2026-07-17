const express = require("express");
const CategoryController = require("../../controllers/category/index.js");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const {
  admin,
  adminOrSubAdmin,
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

const upload = multer({ storage: storage });

// User Routes
router.post(
  "/",
  adminOrSuperAdmin,
  upload.array("images"),
  CategoryController.createCategory
);
router.get("/", CategoryController.getAllCategory);

// Admin Routes
router.get(
  "/admin",
  adminOrSuperAdmin,
  CategoryController.getCategoriesByAdmin
);
router.put(
  "/:id",
  adminOrSuperAdmin,
  upload.array("images"),
  CategoryController.updateCategory
);
router.get("/:id", adminOrSuperAdmin, CategoryController.getCategoryById);
router.delete("/:id", adminOrSuperAdmin, CategoryController.deleteCategory);

module.exports = router;
