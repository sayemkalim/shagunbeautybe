const express = require("express");
const CouponController = require("../../controllers/coupon/index.js");
const { user } = require("../../middleware/auth/userMiddleware.js");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware.js");
const router = express.Router();

// User-facing (must stay above "/:id" below, or "/active" gets swallowed as an id)
router.get("/active", user, CouponController.getActiveCoupons);
router.post("/validate", user, CouponController.validateCoupon);

// Admin management
router.get("/", adminOrSuperAdmin, CouponController.getAllCoupons);
router.post("/", adminOrSuperAdmin, CouponController.createCoupon);
router.get("/:id", adminOrSuperAdmin, CouponController.getCouponById);
router.put("/:id", adminOrSuperAdmin, CouponController.updateCoupon);
router.delete("/:id", adminOrSuperAdmin, CouponController.deleteCoupon);

module.exports = router;
