const CardBanner = require("../../models/cardBannerModel.js");

const normalizeCardBanner = (doc) => {
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

const getAllCardBanners = async ({ skip, limit, is_active, is_card, is_banner }) => {
  let filter = {};
  if (is_active !== undefined) filter.is_active = is_active;
  if (is_card !== undefined) filter.is_card = is_card;
  if (is_banner !== undefined) filter.is_banner = is_banner;

  const banners = await CardBanner.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("products", "name sku price discounted_price banner_image images status")
    .populate("product", "name sku price discounted_price banner_image images status");

  return banners.map(normalizeCardBanner);
};

const countAllCardBanners = async ({ is_active, is_card, is_banner }) => {
  let filter = {};
  if (is_active !== undefined) filter.is_active = is_active;
  if (is_card !== undefined) filter.is_card = is_card;
  if (is_banner !== undefined) filter.is_banner = is_banner;

  return await CardBanner.countDocuments(filter);
};

const getActiveCardBanners = async ({ is_card, is_banner } = {}) => {
  let filter = { is_active: true };
  if (is_card !== undefined) filter.is_card = is_card;
  if (is_banner !== undefined) filter.is_banner = is_banner;

  const banners = await CardBanner.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .populate("products", "name sku price discounted_price banner_image images status")
    .populate("product", "name sku price discounted_price banner_image images status");

  return banners.map(normalizeCardBanner);
};

const getCardBannerById = async (id) => {
  const banner = await CardBanner.findById(id)
    .populate("products", "name sku price discounted_price banner_image images status")
    .populate("product", "name sku price discounted_price banner_image images status");

  return normalizeCardBanner(banner);
};

const createCardBanner = async (data) => {
  const created = await CardBanner.create(data);
  return await getCardBannerById(created._id);
};

const updateCardBanner = async (id, data) => {
  await CardBanner.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  return await getCardBannerById(id);
};

const deleteCardBanner = async (id) => {
  return await CardBanner.findByIdAndDelete(id);
};

module.exports = {
  getAllCardBanners,
  countAllCardBanners,
  getActiveCardBanners,
  getCardBannerById,
  createCardBanner,
  updateCardBanner,
  deleteCardBanner,
};
