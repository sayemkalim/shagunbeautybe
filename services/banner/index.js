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
  const productIds = data.products || (data.product ? [data.product] : []);
  if (productIds.length === 0) {
    return {
      success: false,
      error: "product_required",
      message: "At least one product is required",
    };
  }

  const foundProducts = await Product.find({ _id: { $in: productIds } }).select("_id");
  if (foundProducts.length !== productIds.length) {
    const foundSet = new Set(foundProducts.map((p) => p._id.toString()));
    const missingIds = productIds.filter((id) => !foundSet.has(String(id)));
    return {
      success: false,
      error: "product_not_found",
      message: `Product(s) not found: ${missingIds.join(", ")}`,
    };
  }

  const bannerData = {
    ...data,
    products: productIds,
    product: productIds[0] || null,
  };

  const banner = await BannerRepository.createBanner(bannerData);
  return { success: true, banner };
};

const updateBanner = async (id, data) => {
  let productIds = data.products;
  if (!productIds && data.product) {
    productIds = [data.product];
  }

  if (productIds) {
    if (productIds.length === 0) {
      return {
        success: false,
        error: "product_required",
        message: "At least one product is required",
      };
    }

    const foundProducts = await Product.find({ _id: { $in: productIds } }).select("_id");
    if (foundProducts.length !== productIds.length) {
      const foundSet = new Set(foundProducts.map((p) => p._id.toString()));
      const missingIds = productIds.filter((id) => !foundSet.has(String(id)));
      return {
        success: false,
        error: "product_not_found",
        message: `Product(s) not found: ${missingIds.join(", ")}`,
      };
    }

    data.products = productIds;
    data.product = productIds[0] || null;
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
