const express = require("express");
const BundleController = require("../../controllers/bundle/index.js");
const multer = require("multer");
const { storage } = require("../../config/multer.js");
const { admin, adminOrSuperAdmin } = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

const upload = multer({ storage: storage });

router.post("/", adminOrSuperAdmin, upload.array("images"), BundleController.createBundle);
router.get("/", BundleController.getAllBundles);
router.get("/export", adminOrSuperAdmin, BundleController.exportBundles);
router.get("/sample", adminOrSuperAdmin, BundleController.generateSampleFile);
router.get("/:id", BundleController.getBundleById);
router.put("/:id", adminOrSuperAdmin, upload.array("images"), BundleController.updateBundle);
router.delete("/:id", adminOrSuperAdmin, BundleController.deleteBundle);

module.exports = router;
