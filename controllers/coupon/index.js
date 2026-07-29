const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const CouponService = require("../../services/coupon/index.js");
const mongoose = require("mongoose");

const getAllCoupons = asyncHandler(async (req, res) => {
  const {
    page = 1,
    per_page = 50,
    search = "",
    sort = "latest",
    is_active,
  } = req.query;

  const result = await CouponService.getAllCoupons({
    page,
    per_page,
    search,
    sort,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.json(new ApiResponse(200, result, "Coupons fetched successfully", true));
});

const getCouponById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid coupon ID", false));
  }

  const coupon = await CouponService.getCouponById(id);
  if (!coupon) {
    return res.json(new ApiResponse(404, null, "Coupon not found", false));
  }

  res.json(new ApiResponse(200, coupon, "Coupon fetched successfully", true));
});

const createCoupon = asyncHandler(async (req, res) => {
  const data = { ...req.body };

  if (!data.code || !data.code.trim()) {
    return res.json(new ApiResponse(400, null, "Coupon code is required", false));
  }

  if (!["flat", "percentage"].includes(data.discount_type)) {
    return res.json(
      new ApiResponse(400, null, "discount_type must be 'flat' or 'percentage'", false)
    );
  }

  if (data.discount_value == null || Number(data.discount_value) <= 0) {
    return res.json(
      new ApiResponse(400, null, "A valid discount_value greater than 0 is required", false)
    );
  }

  if (data.discount_type === "percentage" && Number(data.discount_value) > 100) {
    return res.json(
      new ApiResponse(400, null, "Percentage discount cannot exceed 100", false)
    );
  }

  if (data.min_order_value != null && Number(data.min_order_value) < 0) {
    return res.json(
      new ApiResponse(400, null, "min_order_value cannot be negative", false)
    );
  }

  if (req.admin) {
    data.created_by = req.admin._id;
  }

  const result = await CouponService.createCoupon(data);

  if (!result.success) {
    return res.json(new ApiResponse(409, null, result.message, false));
  }

  res.json(new ApiResponse(201, result.coupon, "Coupon created successfully", true));
});

const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid coupon ID", false));
  }

  const data = { ...req.body };

  if (data.discount_type && !["flat", "percentage"].includes(data.discount_type)) {
    return res.json(
      new ApiResponse(400, null, "discount_type must be 'flat' or 'percentage'", false)
    );
  }

  if (data.discount_value != null && Number(data.discount_value) <= 0) {
    return res.json(
      new ApiResponse(400, null, "discount_value must be greater than 0", false)
    );
  }

  const result = await CouponService.updateCoupon(id, data);

  if (!result.success) {
    return res.json(new ApiResponse(409, null, result.message, false));
  }

  if (!result.coupon) {
    return res.json(new ApiResponse(404, null, "Coupon not found", false));
  }

  res.json(new ApiResponse(200, result.coupon, "Coupon updated successfully", true));
});

const deleteCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid coupon ID", false));
  }

  const coupon = await CouponService.deleteCoupon(id);
  if (!coupon) {
    return res.json(new ApiResponse(404, null, "Coupon not found", false));
  }

  res.json(new ApiResponse(200, null, "Coupon deleted successfully", true));
});

// User-facing: list coupons the current user can still redeem
const getActiveCoupons = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const coupons = await CouponService.getActiveCouponsForUser(userId);
  res.json(new ApiResponse(200, coupons, "Active coupons fetched successfully", true));
});

// User-facing: validate a coupon against the current order total without redeeming it.
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, order_total } = req.body;
  const userId = req.user._id;

  if (!code) {
    return res.json(new ApiResponse(400, null, "Coupon code is required", false));
  }

  const orderTotal = Number(order_total);
  if (order_total == null || isNaN(orderTotal) || orderTotal < 0) {
    return res.json(new ApiResponse(400, null, "A valid order_total is required", false));
  }

  const result = await CouponService.validateCoupon({ code, userId, orderTotal });

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  res.json(
    new ApiResponse(
      200,
      {
        coupon_id: result.coupon._id,
        code: result.coupon.code,
        discount_type: result.coupon.discount_type,
        discount_value: result.coupon.discount_value,
        discount_amount: result.discount_amount,
        final_amount: result.final_amount,
      },
      "Coupon applied successfully",
      true
    )
  );
});

module.exports = {
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getActiveCoupons,
  validateCoupon,
};
