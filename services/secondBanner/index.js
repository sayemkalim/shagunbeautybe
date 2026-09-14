const SecondBannerRepository = require("../../repositories/secondBanner/index.js");
const Product = require("../../models/productsModel.js");
const mongoose = require("mongoose");

const getAllBanners = async ({ page, per_page, is_active }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  const banners = await SecondBannerRepository.getAllBanners({
    skip,
    limit,
    is_active,
  });
  const total = await SecondBannerRepository.countAllBanners({ is_active });

  return {
    total,
    page: parseInt(page, 10),
    per_page: limit,
    total_pages: Math.ceil(total / per_page),
    banners,
  };
};

const getActiveBanners = async () => {
  return await SecondBannerRepository.getActiveBanners();
};

const getActiveBanner = async () => {
  return await SecondBannerRepository.getActiveBanner();
};

const getBannerById = async (id) => {
  return await SecondBannerRepository.getBannerById(id);
};

const createBanner = async (data) => {
  if (!data.banner_url) {
    return {
      success: false,
      error: "banner_image_required",
      message: "Banner image is required",
    };
  }

  let product = null;
  if (data.product) {
    if (!mongoose.Types.ObjectId.isValid(data.product)) {
      return {
        success: false,
        error: "invalid_product_id",
        message: "Invalid product ID",
      };
    }
    const foundProduct = await Product.findById(data.product).select("_id");
    if (!foundProduct) {
      return {
        success: false,
        error: "product_not_found",
        message: "Product not found",
      };
    }
    product = foundProduct._id;
  }

  const bannerData = {
    ...data,
    product,
  };

  const banner = await SecondBannerRepository.createBanner(bannerData);
  return { success: true, banner };
};

const updateBanner = async (id, data) => {
  if (data.product !== undefined && data.product !== null && data.product !== "") {
    if (!mongoose.Types.ObjectId.isValid(data.product)) {
      return {
        success: false,
        error: "invalid_product_id",
        message: "Invalid product ID",
      };
    }
    const foundProduct = await Product.findById(data.product).select("_id");
    if (!foundProduct) {
      return {
        success: false,
        error: "product_not_found",
        message: "Product not found",
      };
    }
    data.product = foundProduct._id;
  } else if (data.product === "" || data.product === null) {
    data.product = null;
  }

  const banner = await SecondBannerRepository.updateBanner(id, data);
  return { success: true, banner };
};

const deleteBanner = async (id) => {
  return await SecondBannerRepository.deleteBanner(id);
};

module.exports = {
  getAllBanners,
  getActiveBanners,
  getActiveBanner,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
};
