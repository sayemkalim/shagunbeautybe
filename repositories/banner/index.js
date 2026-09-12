const Banner = require("../../models/bannerModel.js");

const normalizeBanner = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if ((!obj.products || obj.products.length === 0) && obj.product) {
    obj.products = [obj.product];
  }
  if (!obj.product && obj.products && obj.products.length > 0) {
    obj.product = obj.products[0];
  }
  return obj;
};

const getAllBanners = async ({ skip, limit, is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  const banners = await Banner.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("products", "name sku price discounted_price banner_image status")
    .populate("product", "name sku price discounted_price banner_image status");

  return banners.map(normalizeBanner);
};

const countAllBanners = async ({ is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await Banner.countDocuments(filter);
};

const getActiveBanners = async () => {
  const banners = await Banner.find({ is_active: true })
    .sort({ order: 1, createdAt: -1 })
    .populate("products", "name sku price discounted_price banner_image status")
    .populate("product", "name sku price discounted_price banner_image status");

  return banners.map(normalizeBanner);
};

const getBannerById = async (id) => {
  const banner = await Banner.findById(id)
    .populate("products", "name sku price discounted_price banner_image status")
    .populate("product", "name sku price discounted_price banner_image status");

  return normalizeBanner(banner);
};

const createBanner = async (data) => {
  const created = await Banner.create(data);
  const banner = await Banner.findById(created._id)
    .populate("products", "name sku price discounted_price banner_image status")
    .populate("product", "name sku price discounted_price banner_image status");

  return normalizeBanner(banner);
};

const updateBanner = async (id, data) => {
  const banner = await Banner.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  })
    .populate("products", "name sku price discounted_price banner_image status")
    .populate("product", "name sku price discounted_price banner_image status");

  return normalizeBanner(banner);
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
