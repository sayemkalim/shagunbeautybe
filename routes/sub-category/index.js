const express = require("express");
const SubCategoryController = require("../../controllers/sub-category/index.js");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

const upload = multer({ storage: storage });

router.post(
  "/",
  adminOrSuperAdmin,
  upload.array("images"),
  SubCategoryController.createSubCategory
);
router.get("/", SubCategoryController.getAllSubCategories);
router.put(
  "/:id",
  adminOrSuperAdmin,
  upload.array("images"),
  SubCategoryController.updateSubCategory
);
router.get("/:id", adminOrSuperAdmin, SubCategoryController.getSubCategoryById);
router.delete(
  "/:id",
  adminOrSuperAdmin,
  SubCategoryController.deleteSubCategory
);

module.exports = router;
