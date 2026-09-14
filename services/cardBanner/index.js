const CardBannerRepository = require("../../repositories/cardBanner/index.js");
const Product = require("../../models/productsModel.js");
const mongoose = require("mongoose");

const getAllCardBanners = async ({ page = 1, per_page = 50, is_active, is_card, is_banner }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  const banners = await CardBannerRepository.getAllCardBanners({
    skip,
    limit,
    is_active,
    is_card,
    is_banner,
  });
  const total = await CardBannerRepository.countAllCardBanners({
    is_active,
    is_card,
    is_banner,
  });

  return {
    total,
    page: parseInt(page, 10),
    per_page: limit,
    total_pages: Math.ceil(total / per_page),
    banners,
  };
};

const getActiveCardBanners = async (filter) => {
  return await CardBannerRepository.getActiveCardBanners(filter);
};

const getCardBannerById = async (id) => {
  return await CardBannerRepository.getCardBannerById(id);
};

const resolveCardBannerFlags = (is_card, is_banner) => {
  let resolvedIsCard = false;
  let resolvedIsBanner = true;

  if (is_card !== undefined) {
    resolvedIsCard = is_card === "true" || is_card === true;
    resolvedIsBanner = !resolvedIsCard;
  } else if (is_banner !== undefined) {
    resolvedIsBanner = is_banner === "true" || is_banner === true;
    resolvedIsCard = !resolvedIsBanner;
  }

  return { is_card: resolvedIsCard, is_banner: resolvedIsBanner };
};

const createCardBanner = async (data) => {
  if (!data.banner_url) {
    return {
      success: false,
      error: "banner_image_required",
      message: "Banner image is required",
    };
  }

  let productIds = data.products || (data.product ? [data.product] : []);
  if (typeof productIds === "string") {
    productIds = [productIds];
  }

  if (productIds.length > 0) {
    const validIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== productIds.length) {
      return {
        success: false,
        error: "invalid_product_id",
        message: "One or more product IDs are invalid",
      };
    }

    const foundProducts = await Product.find({ _id: { $in: validIds } }).select("_id");
    if (foundProducts.length !== validIds.length) {
      const foundSet = new Set(foundProducts.map((p) => p._id.toString()));
      const missingIds = validIds.filter((id) => !foundSet.has(String(id)));
      return {
        success: false,
        error: "product_not_found",
        message: `Product(s) not found: ${missingIds.join(", ")}`,
      };
    }
    productIds = validIds;
  }

  const { is_card, is_banner } = resolveCardBannerFlags(data.is_card, data.is_banner);

  const bannerData = {
    banner_url: data.banner_url,
    text: data.text ? String(data.text).trim() : "",
    title: data.title ? String(data.title).trim() : "",
    products: productIds,
    product: productIds[0] || null,
    is_card,
    is_banner,
    order: data.order !== undefined ? Number(data.order) : 0,
    is_active: data.is_active !== undefined ? data.is_active === "true" || data.is_active === true : true,
    created_by: data.created_by || null,
  };

  const banner = await CardBannerRepository.createCardBanner(bannerData);
  return { success: true, banner };
};

const updateCardBanner = async (id, data) => {
  const updatePayload = {};

  if (data.banner_url) updatePayload.banner_url = data.banner_url;
  if (data.text !== undefined) updatePayload.text = String(data.text).trim();
  if (data.title !== undefined) updatePayload.title = String(data.title).trim();
  if (data.order !== undefined) updatePayload.order = Number(data.order);
  if (data.is_active !== undefined) {
    updatePayload.is_active = data.is_active === "true" || data.is_active === true;
  }

  if (data.is_card !== undefined || data.is_banner !== undefined) {
    const { is_card, is_banner } = resolveCardBannerFlags(data.is_card, data.is_banner);
    updatePayload.is_card = is_card;
    updatePayload.is_banner = is_banner;
  }

  if (data.products !== undefined || data.product !== undefined) {
    let productIds = data.products || (data.product ? [data.product] : []);
    if (typeof productIds === "string") productIds = [productIds];

    if (productIds.length > 0) {
      const validIds = productIds.filter((pId) => mongoose.Types.ObjectId.isValid(pId));
      if (validIds.length !== productIds.length) {
        return {
          success: false,
          error: "invalid_product_id",
          message: "One or more product IDs are invalid",
        };
      }

      const foundProducts = await Product.find({ _id: { $in: validIds } }).select("_id");
      if (foundProducts.length !== validIds.length) {
        const foundSet = new Set(foundProducts.map((p) => p._id.toString()));
        const missingIds = validIds.filter((pId) => !foundSet.has(String(pId)));
        return {
          success: false,
          error: "product_not_found",
          message: `Product(s) not found: ${missingIds.join(", ")}`,
        };
      }
      updatePayload.products = validIds;
      updatePayload.product = validIds[0] || null;
    } else {
      updatePayload.products = [];
      updatePayload.product = null;
    }
  }

  const banner = await CardBannerRepository.updateCardBanner(id, updatePayload);
  return { success: true, banner };
};

const deleteCardBanner = async (id) => {
  return await CardBannerRepository.deleteCardBanner(id);
};

module.exports = {
  getAllCardBanners,
  getActiveCardBanners,
  getCardBannerById,
  createCardBanner,
  updateCardBanner,
  deleteCardBanner,
};
