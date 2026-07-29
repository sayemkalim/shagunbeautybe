const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const BannerService = require("../../services/banner/index.js");
const mongoose = require("mongoose");
const { uploadSingleFile } = require("../../utils/upload/index.js");

const getAllBanners = asyncHandler(async (req, res) => {
  const { page = 1, per_page = 50, is_active } = req.query;

  const result = await BannerService.getAllBanners({
    page,
    per_page,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.json(new ApiResponse(200, result, "Banners fetched successfully", true));
});

// Public: storefront banner carousel
const getActiveBanners = asyncHandler(async (req, res) => {
  const banners = await BannerService.getActiveBanners();
  res.json(new ApiResponse(200, banners, "Active banners fetched successfully", true));
});

const getBannerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid banner ID", false));
  }

  const banner = await BannerService.getBannerById(id);
  if (!banner) {
    return res.json(new ApiResponse(404, null, "Banner not found", false));
  }

  res.json(new ApiResponse(200, banner, "Banner fetched successfully", true));
});

const createBanner = asyncHandler(async (req, res) => {
  const { product_id, order, is_active } = req.body;

  if (!req.file) {
    return res.json(new ApiResponse(400, null, "Banner image is required", false));
  }

  if (!product_id || !mongoose.Types.ObjectId.isValid(product_id)) {
    return res.json(new ApiResponse(400, null, "A valid product_id is required", false));
  }

  const banner_url = await uploadSingleFile(req.file.path, "uploads/banners");

  const result = await BannerService.createBanner({
    banner_url,
    product: product_id,
    order: order !== undefined ? Number(order) : 0,
    is_active: is_active !== undefined ? is_active === "true" : true,
    created_by: req.admin._id,
  });

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  res.json(new ApiResponse(201, result.banner, "Banner created successfully", true));
});

const updateBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid banner ID", false));
  }

  const { product_id, order, is_active } = req.body;
  const data = {};

  if (product_id) {
    if (!mongoose.Types.ObjectId.isValid(product_id)) {
      return res.json(new ApiResponse(400, null, "Invalid product_id", false));
    }
    data.product = product_id;
  }

  if (order !== undefined) data.order = Number(order);
  if (is_active !== undefined) data.is_active = is_active === "true";

  if (req.file) {
    data.banner_url = await uploadSingleFile(req.file.path, "uploads/banners");
  }

  const result = await BannerService.updateBanner(id, data);

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  if (!result.banner) {
    return res.json(new ApiResponse(404, null, "Banner not found", false));
  }

  res.json(new ApiResponse(200, result.banner, "Banner updated successfully", true));
});

const deleteBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid banner ID", false));
  }

  const banner = await BannerService.deleteBanner(id);
  if (!banner) {
    return res.json(new ApiResponse(404, null, "Banner not found", false));
  }

  res.json(new ApiResponse(200, null, "Banner deleted successfully", true));
});

module.exports = {
  getAllBanners,
  getActiveBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
};
