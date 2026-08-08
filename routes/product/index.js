const express = require("express");
const ProductController = require("../../controllers/products/index.js");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const { admin, adminOrSuperAdmin } = require("../../middleware/auth/adminMiddleware.js");
const { user } = require("../../middleware/auth/userMiddleware.js");
const router = express.Router();

const upload = multer({ storage: storage });

router.post("/", adminOrSuperAdmin, upload.any(), ProductController.createProduct);
router.get("/", ProductController.getAllProducts);
router.get("/export", adminOrSuperAdmin, ProductController.exportProducts);
router.get("/sample", adminOrSuperAdmin, ProductController.generateSampleFile);
router.get("/admin", adminOrSuperAdmin, ProductController.getProductsByAdmin);
router.get("/recommendations", ProductController.getProductRecommendations);
router.get("/check-purchased", user, ProductController.checkProductPurchased);

router.post("/migrate-images/all", adminOrSuperAdmin, ProductController.migrateAllProductsImagesToCloudinary);
router.post("/migrate-images/:id", adminOrSuperAdmin, ProductController.migrateProductImagesToCloudinary);

router.get("/:id", ProductController.getProductById);
router.put("/:id", adminOrSuperAdmin, upload.any(), ProductController.updateProduct);
router.delete("/:id", adminOrSuperAdmin, ProductController.deleteProduct);
router.post("/bulk", adminOrSuperAdmin, ProductController.bulkCreateProducts);
router.patch("/bulk-update", adminOrSuperAdmin, ProductController.bulkUpdateProducts);

module.exports = router;
