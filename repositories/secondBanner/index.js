const SecondBanner = require("../../models/secondBannerModel.js");

const getAllBanners = async ({ skip, limit, is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await SecondBanner.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("product", "name sku price discounted_price banner_image status");
};

const countAllBanners = async ({ is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await SecondBanner.countDocuments(filter);
};

const getActiveBanners = async () => {
  return await SecondBanner.find({ is_active: true })
    .sort({ order: 1, createdAt: -1 })
    .populate("product", "name sku price discounted_price banner_image status");
};

const getActiveBanner = async () => {
  return await SecondBanner.findOne({ is_active: true })
    .sort({ order: 1, createdAt: -1 })
    .populate("product", "name sku price discounted_price banner_image status");
};

const getBannerById = async (id) => {
  return await SecondBanner.findById(id).populate(
    "product",
    "name sku price discounted_price banner_image status"
  );
};

const createBanner = async (data) => {
  const created = await SecondBanner.create(data);
  return await SecondBanner.findById(created._id).populate(
    "product",
    "name sku price discounted_price banner_image status"
  );
};

const updateBanner = async (id, data) => {
  return await SecondBanner.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).populate("product", "name sku price discounted_price banner_image status");
};

const deleteBanner = async (id) => {
  return await SecondBanner.findByIdAndDelete(id);
};

module.exports = {
  getAllBanners,
  countAllBanners,
  getActiveBanners,
  getActiveBanner,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
};
