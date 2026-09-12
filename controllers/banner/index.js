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

const extractProductIds = (body) => {
  let raw = body.products ?? body.product_ids ?? body.product_id;
  if (raw === undefined || raw === null || raw === "") return [];

  if (typeof raw === "string") {
    raw = raw.trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = raw.slice(1, -1).split(",");
      }
    } else if (raw.includes(",")) {
      raw = raw.split(",");
    } else {
      raw = [raw];
    }
  }

  if (!Array.isArray(raw)) {
    raw = [raw];
  }

  const ids = [];
  for (let item of raw) {
    if (!item) continue;
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
        ids.push(trimmed.slice(1, -1).trim());
      } else if (trimmed.includes(",")) {
        ids.push(...trimmed.split(",").map((s) => s.trim()));
      } else {
        ids.push(trimmed);
      }
    } else if (typeof item === "object") {
      if (item._id) ids.push(String(item._id).trim());
      else if (item.product) ids.push(String(item.product).trim());
      else if (item.id) ids.push(String(item.id).trim());
    }
  }

  return [...new Set(ids.filter(Boolean))];
};

const createBanner = asyncHandler(async (req, res) => {
  const { order, is_active } = req.body;

  if (!req.file) {
    return res.json(new ApiResponse(400, null, "Banner image is required", false));
  }

  const productIds = extractProductIds(req.body);
  if (productIds.length === 0) {
    return res.json(
      new ApiResponse(400, null, "At least one valid product is required", false)
    );
  }

  const invalidIds = productIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return res.json(
      new ApiResponse(400, null, `Invalid product ID(s): ${invalidIds.join(", ")}`, false)
    );
  }

  const banner_url = await uploadSingleFile(req.file.path, "uploads/banners");

  const result = await BannerService.createBanner({
    banner_url,
    products: productIds,
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

  const { order, is_active } = req.body;
  const data = {};

  const hasProductsField =
    req.body.products !== undefined ||
    req.body.product_ids !== undefined ||
    req.body.product_id !== undefined;

  if (hasProductsField) {
    const productIds = extractProductIds(req.body);
    if (productIds.length === 0) {
      return res.json(
        new ApiResponse(400, null, "At least one valid product is required", false)
      );
    }

    const invalidIds = productIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.json(
        new ApiResponse(400, null, `Invalid product ID(s): ${invalidIds.join(", ")}`, false)
      );
    }

    data.products = productIds;
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
