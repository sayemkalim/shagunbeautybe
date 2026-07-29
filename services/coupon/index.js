const CouponRepository = require("../../repositories/coupon/index.js");

const getAllCoupons = async ({ page, per_page, search, sort, is_active }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);
  const sortOrder = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  const coupons = await CouponRepository.getAllCoupons({
    search,
    sortOrder,
    skip,
    limit,
    is_active,
  });

  const total = await CouponRepository.countAllCoupons({ search, is_active });

  return {
    total,
    page: parseInt(page, 10),
    per_page: limit,
    total_pages: Math.ceil(total / per_page),
    coupons,
  };
};

const getCouponById = async (id) => {
  return await CouponRepository.getCouponById(id);
};

const createCoupon = async (data) => {
  if (data.code) {
    data.code = data.code.trim().toUpperCase();
  }

  const existing = await CouponRepository.getCouponByCode(data.code);
  if (existing) {
    return {
      success: false,
      error: "duplicate_code",
      message: `Coupon code ${data.code} already exists`,
    };
  }

  const coupon = await CouponRepository.createCoupon(data);
  return { success: true, coupon };
};

const updateCoupon = async (id, data) => {
  if (data.code) {
    data.code = data.code.trim().toUpperCase();
    const existing = await CouponRepository.getCouponByCode(data.code);
    if (existing && existing._id.toString() !== id) {
      return {
        success: false,
        error: "duplicate_code",
        message: `Coupon code ${data.code} already exists`,
      };
    }
  }

  const coupon = await CouponRepository.updateCoupon(id, data);
  return { success: true, coupon };
};

const deleteCoupon = async (id) => {
  return await CouponRepository.deleteCoupon(id);
};

// Calculates the discount amount for a given order total, respecting the
// percentage cap and never discounting more than the order total itself.
const calculateDiscount = (coupon, orderTotal) => {
  let discount = 0;

  if (coupon.discount_type === "flat") {
    discount = coupon.discount_value;
  } else {
    discount = (orderTotal * coupon.discount_value) / 100;
    if (coupon.max_discount_amount != null) {
      discount = Math.min(discount, coupon.max_discount_amount);
    }
  }

  discount = Math.min(discount, orderTotal);
  return Math.round(discount * 100) / 100;
};

// Validates a coupon for a user against a given order total, without recording usage.
const validateCoupon = async ({ code, userId, orderTotal }) => {
  if (!code) {
    return { success: false, message: "Coupon code is required" };
  }

  const coupon = await CouponRepository.getCouponByCode(code);
  if (!coupon) {
    return { success: false, message: "Invalid coupon code" };
  }

  if (!coupon.is_active) {
    return { success: false, message: "This coupon is no longer active" };
  }

  const now = new Date();
  if (coupon.valid_from && now < coupon.valid_from) {
    return { success: false, message: "This coupon is not yet valid" };
  }
  if (coupon.valid_until && now > coupon.valid_until) {
    return { success: false, message: "This coupon has expired" };
  }

  if (orderTotal < coupon.min_order_value) {
    return {
      success: false,
      message: `Minimum order value of ₹${coupon.min_order_value} is required to use this coupon`,
    };
  }

  if (
    coupon.usage_limit_total != null &&
    coupon.used_count >= coupon.usage_limit_total
  ) {
    return { success: false, message: "This coupon has reached its usage limit" };
  }

  if (userId) {
    const userUsageCount = await CouponRepository.countUsageByUser(
      coupon._id,
      userId
    );
    if (userUsageCount >= coupon.usage_limit_per_user) {
      return {
        success: false,
        message: "You have already used this coupon the maximum number of times",
      };
    }
  }

  const discountAmount = calculateDiscount(coupon, orderTotal);

  return {
    success: true,
    coupon,
    discount_amount: discountAmount,
    final_amount: Math.round((orderTotal - discountAmount) * 100) / 100,
  };
};

// Records a coupon redemption against an order (called once the order is created).
const applyCouponUsage = async ({ couponId, userId, orderId, discountAmount, orderTotal }) => {
  await CouponRepository.createUsageRecord({
    coupon: couponId,
    user: userId,
    order: orderId,
    discount_amount: discountAmount,
    order_total: orderTotal,
  });
  await CouponRepository.incrementUsedCount(couponId);
};

// Reverses a coupon redemption (called when an order using it is cancelled).
const releaseCouponUsage = async (orderId) => {
  const usage = await CouponRepository.getUsageByOrder(orderId);
  if (!usage) return null;

  await CouponRepository.deleteUsageByOrder(orderId);
  await CouponRepository.decrementUsedCount(usage.coupon);
  return usage;
};

module.exports = {
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  calculateDiscount,
  applyCouponUsage,
  releaseCouponUsage,
};
