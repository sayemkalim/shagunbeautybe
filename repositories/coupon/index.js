const Coupon = require("../../models/couponModel.js");
const CouponUsage = require("../../models/couponUsageModel.js");

const getAllCoupons = async ({ search, sortOrder, skip, limit, is_active }) => {
  let filter = {};
  if (search) {
    filter.$or = [
      { code: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await Coupon.find(filter).sort(sortOrder).skip(skip).limit(limit);
};

const countAllCoupons = async ({ search, is_active }) => {
  let filter = {};
  if (search) {
    filter.$or = [
      { code: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await Coupon.countDocuments(filter);
};

const getCouponById = async (id) => {
  return await Coupon.findById(id);
};

const getCouponByCode = async (code) => {
  return await Coupon.findOne({ code: code.trim().toUpperCase() });
};

const createCoupon = async (data) => {
  return await Coupon.create(data);
};

const updateCoupon = async (id, data) => {
  return await Coupon.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

const deleteCoupon = async (id) => {
  return await Coupon.findByIdAndDelete(id);
};

const incrementUsedCount = async (id) => {
  return await Coupon.findByIdAndUpdate(
    id,
    { $inc: { used_count: 1 } },
    { new: true }
  );
};

const decrementUsedCount = async (id) => {
  return await Coupon.findByIdAndUpdate(
    id,
    { $inc: { used_count: -1 } },
    { new: true }
  );
};

const countUsageByUser = async (couponId, userId) => {
  return await CouponUsage.countDocuments({ coupon: couponId, user: userId });
};

const createUsageRecord = async (data) => {
  return await CouponUsage.create(data);
};

const getUsageByOrder = async (orderId) => {
  return await CouponUsage.findOne({ order: orderId });
};

const deleteUsageByOrder = async (orderId) => {
  return await CouponUsage.findOneAndDelete({ order: orderId });
};

module.exports = {
  getAllCoupons,
  countAllCoupons,
  getCouponById,
  getCouponByCode,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  incrementUsedCount,
  decrementUsedCount,
  countUsageByUser,
  createUsageRecord,
  getUsageByOrder,
  deleteUsageByOrder,
};
