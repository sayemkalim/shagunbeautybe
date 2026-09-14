const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const SecondBannerService = require("../../services/secondBanner/index.js");
const mongoose = require("mongoose");
const { uploadSingleFile } = require("../../utils/upload/index.js");

const getAllBanners = asyncHandler(async (req, res) => {
  const { page = 1, per_page = 50, is_active } = req.query;

  const result = await SecondBannerService.getAllBanners({
    page,
    per_page,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.json(
    new ApiResponse(200, result, "Second banners fetched successfully", true)
  );
});

// Public: single active second banner (or array if ?format=array)
const getActiveBanner = asyncHandler(async (req, res) => {
  const { format, array } = req.query;

  if (format === "array" || array === "true") {
    const banners = await SecondBannerService.getActiveBanners();
    return res.json(
      new ApiResponse(
        200,
        banners,
        "Active second banners fetched successfully",
        true
      )
    );
  }

  const banner = await SecondBannerService.getActiveBanner();
  res.json(
    new ApiResponse(
      200,
      banner,
      "Active second banner fetched successfully",
      true
    )
  );
});

// Public: active second banners array list
const getActiveBannersList = asyncHandler(async (req, res) => {
  const banners = await SecondBannerService.getActiveBanners();
  res.json(
    new ApiResponse(
      200,
      banners,
      "Active second banners fetched successfully",
      true
    )
  );
});

const getBannerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid second banner ID", false)
    );
  }

  const banner = await SecondBannerService.getBannerById(id);
  if (!banner) {
    return res.json(
      new ApiResponse(404, null, "Second banner not found", false)
    );
  }

  res.json(
    new ApiResponse(200, banner, "Second banner fetched successfully", true)
  );
});

const createBanner = asyncHandler(async (req, res) => {
  const { title, product, product_id, link, order, is_active } = req.body;

  let banner_url = null;
  if (req.file) {
    banner_url = await uploadSingleFile(
      req.file.path,
      "uploads/second_banners"
    );
  } else if (
    req.body.banner_url ||
    req.body.banner_image ||
    req.body.image
  ) {
    const rawUrl =
      req.body.banner_url || req.body.banner_image || req.body.image;
    if (typeof rawUrl === "string" && rawUrl.startsWith("http")) {
      banner_url = rawUrl;
    }
  }

  if (!banner_url) {
    return res.json(
      new ApiResponse(400, null, "Banner image is required", false)
    );
  }

  const resolvedProductId = product || product_id || null;

  const result = await SecondBannerService.createBanner({
    banner_url,
    title: title || "",
    product: resolvedProductId,
    link: link || "",
    order: order !== undefined ? Number(order) : 0,
    is_active: is_active !== undefined ? is_active === "true" || is_active === true : true,
    created_by: req.admin?._id || null,
  });

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  res.json(
    new ApiResponse(201, result.banner, "Second banner created successfully", true)
  );
});

const updateBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid second banner ID", false)
    );
  }

  const { title, product, product_id, link, order, is_active } = req.body;
  const data = {};

  if (title !== undefined) data.title = title;
  if (link !== undefined) data.link = link;
  if (order !== undefined) data.order = Number(order);
  if (is_active !== undefined) {
    data.is_active = is_active === "true" || is_active === true;
  }

  if (product !== undefined || product_id !== undefined) {
    data.product = product || product_id || null;
  }

  if (req.file) {
    data.banner_url = await uploadSingleFile(
      req.file.path,
      "uploads/second_banners"
    );
  } else if (
    req.body.banner_url ||
    req.body.banner_image ||
    req.body.image
  ) {
    const rawUrl =
      req.body.banner_url || req.body.banner_image || req.body.image;
    if (typeof rawUrl === "string" && rawUrl.startsWith("http")) {
      data.banner_url = rawUrl;
    }
  }

  const result = await SecondBannerService.updateBanner(id, data);

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  if (!result.banner) {
    return res.json(
      new ApiResponse(404, null, "Second banner not found", false)
    );
  }

  res.json(
    new ApiResponse(200, result.banner, "Second banner updated successfully", true)
  );
});

const deleteBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid second banner ID", false)
    );
  }

  const banner = await SecondBannerService.deleteBanner(id);
  if (!banner) {
    return res.json(
      new ApiResponse(404, null, "Second banner not found", false)
    );
  }

  res.json(
    new ApiResponse(200, null, "Second banner deleted successfully", true)
  );
});

module.exports = {
  getAllBanners,
  getActiveBanner,
  getActiveBannersList,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
};
