const Banner = require("../../models/bannerModel.js");

const getAllBanners = async ({ skip, limit, is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await Banner.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("product", "name sku price discounted_price banner_image");
};

const countAllBanners = async ({ is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await Banner.countDocuments(filter);
};

const getActiveBanners = async () => {
  return await Banner.find({ is_active: true })
    .sort({ order: 1, createdAt: -1 })
    .populate("product", "name sku price discounted_price banner_image status");
};

const getBannerById = async (id) => {
  return await Banner.findById(id).populate(
    "product",
    "name sku price discounted_price banner_image"
  );
};

const createBanner = async (data) => {
  return await Banner.create(data);
};

const updateBanner = async (id, data) => {
  return await Banner.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).populate("product", "name sku price discounted_price banner_image");
};

const deleteBanner = async (id) => {
  return await Banner.findByIdAndDelete(id);
};

module.exports = {
  getAllBanners,
  countAllBanners,
  getActiveBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
};
