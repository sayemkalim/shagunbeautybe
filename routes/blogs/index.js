  const express = require("express");
  const router = express.Router();
  const BlogController = require("../../controllers/blogs/index.js");
  const multer = require("multer");
  const { storage } = require("../../config/multer.js");
  const {
    adminOrSuperAdmin,
  } = require("../../middleware/auth/adminMiddleware.js");

  const upload = multer({ storage: storage });

  router.post(
    "/",
    adminOrSuperAdmin,
    upload.single("banner_image_url"),
    BlogController.postBlogs
  );
  router.get("/", BlogController.getBlogs);
  router.get("/:id", BlogController.getSingleBlog);
  router.put(
    "/edit/:id",
    adminOrSuperAdmin,
    upload.single("banner_image_url"),
    BlogController.updateBlog
  );
  router.delete("/delete/:id", adminOrSuperAdmin, BlogController.deleteBlog);

  module.exports = router;
