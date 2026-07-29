const BannerRepository = require("../../repositories/banner/index.js");
const Product = require("../../models/productsModel.js");

const getAllBanners = async ({ page, per_page, is_active }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  const banners = await BannerRepository.getAllBanners({ skip, limit, is_active });
  const total = await BannerRepository.countAllBanners({ is_active });

  return {
    total,
    page: parseInt(page, 10),
    per_page: limit,
    total_pages: Math.ceil(total / per_page),
    banners,
  };
};

const getActiveBanners = async () => {
  return await BannerRepository.getActiveBanners();
};

const getBannerById = async (id) => {
  return await BannerRepository.getBannerById(id);
};

const createBanner = async (data) => {
  const product = await Product.findById(data.product);
  if (!product) {
    return { success: false, error: "product_not_found", message: "Product not found" };
  }

  const banner = await BannerRepository.createBanner(data);
  return { success: true, banner };
};

const updateBanner = async (id, data) => {
  if (data.product) {
    const product = await Product.findById(data.product);
    if (!product) {
      return { success: false, error: "product_not_found", message: "Product not found" };
    }
  }

  const banner = await BannerRepository.updateBanner(id, data);
  return { success: true, banner };
};

const deleteBanner = async (id) => {
  return await BannerRepository.deleteBanner(id);
};

module.exports = {
  getAllBanners,
  getActiveBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
};
