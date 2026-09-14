const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const CardBannerService = require("../../services/cardBanner/index.js");
const mongoose = require("mongoose");
const { uploadSingleFile } = require("../../utils/upload/index.js");

const extractProductIds = (body) => {
  let raw = body.products ?? body.product_ids ?? body.product_id ?? body.product;
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

const getAllCardBanners = asyncHandler(async (req, res) => {
  const { page = 1, per_page = 50, is_active, is_card, is_banner } = req.query;

  const result = await CardBannerService.getAllCardBanners({
    page,
    per_page,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
    is_card: is_card !== undefined ? is_card === "true" : undefined,
    is_banner: is_banner !== undefined ? is_banner === "true" : undefined,
  });

  res.json(
    new ApiResponse(200, result, "Card banners fetched successfully", true)
  );
});

// Public: active card banners for storefront/mobile (supports filtering by is_card / is_banner)
const getActiveCardBanners = asyncHandler(async (req, res) => {
  const { is_card, is_banner } = req.query;

  const filter = {};
  if (is_card !== undefined) filter.is_card = is_card === "true";
  if (is_banner !== undefined) filter.is_banner = is_banner === "true";

  const banners = await CardBannerService.getActiveCardBanners(filter);
  res.json(
    new ApiResponse(200, banners, "Active card banners fetched successfully", true)
  );
});

const getCardBannerById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid card banner ID", false)
    );
  }

  const banner = await CardBannerService.getCardBannerById(id);
  if (!banner) {
    return res.json(
      new ApiResponse(404, null, "Card banner not found", false)
    );
  }

  res.json(
    new ApiResponse(200, banner, "Card banner fetched successfully", true)
  );
});

const createCardBanner = asyncHandler(async (req, res) => {
  const { heading, text, is_card, is_banner, order, is_active } = req.body;
  const title = req.body.title || req.body.section_title || req.body.banner_title || "";
  const bannerHeading = heading || req.body.section_heading || "";

  let banner_url = null;
  if (req.file) {
    banner_url = await uploadSingleFile(req.file.path, "uploads/card_banners");
  } else if (
    req.body.banner_url ||
    req.body.banner_image ||
    req.body.image
  ) {
    const rawUrl = req.body.banner_url || req.body.banner_image || req.body.image;
    if (typeof rawUrl === "string" && rawUrl.startsWith("http")) {
      banner_url = rawUrl;
    }
  }

  if (!banner_url) {
    return res.json(
      new ApiResponse(400, null, "Banner image is required", false)
    );
  }

  const productIds = extractProductIds(req.body);

  const result = await CardBannerService.createCardBanner({
    banner_url,
    heading: bannerHeading,
    title,
    text,
    products: productIds,
    is_card,
    is_banner,
    order: order !== undefined ? Number(order) : 0,
    is_active: is_active !== undefined ? is_active === "true" || is_active === true : true,
    created_by: req.admin?._id || null,
  });

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  res.json(
    new ApiResponse(201, result.banner, "Card banner created successfully", true)
  );
});

const updateCardBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid card banner ID", false)
    );
  }

  const { heading, text, is_card, is_banner, order, is_active } = req.body;
  const data = {};

  const bannerHeading = heading !== undefined ? heading : req.body.section_heading;
  if (bannerHeading !== undefined) data.heading = bannerHeading;

  const title = req.body.title ?? req.body.section_title ?? req.body.banner_title;
  if (title !== undefined) data.title = title;
  if (text !== undefined) data.text = text;
  if (order !== undefined) data.order = Number(order);
  if (is_active !== undefined) {
    data.is_active = is_active === "true" || is_active === true;
  }
  if (is_card !== undefined) data.is_card = is_card;
  if (is_banner !== undefined) data.is_banner = is_banner;

  const hasProductsField =
    req.body.products !== undefined ||
    req.body.product_ids !== undefined ||
    req.body.product_id !== undefined ||
    req.body.product !== undefined;

  if (hasProductsField) {
    data.products = extractProductIds(req.body);
  }

  if (req.file) {
    data.banner_url = await uploadSingleFile(req.file.path, "uploads/card_banners");
  } else if (
    req.body.banner_url ||
    req.body.banner_image ||
    req.body.image
  ) {
    const rawUrl = req.body.banner_url || req.body.banner_image || req.body.image;
    if (typeof rawUrl === "string" && rawUrl.startsWith("http")) {
      data.banner_url = rawUrl;
    }
  }

  const result = await CardBannerService.updateCardBanner(id, data);

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  if (!result.banner) {
    return res.json(
      new ApiResponse(404, null, "Card banner not found", false)
    );
  }

  res.json(
    new ApiResponse(200, result.banner, "Card banner updated successfully", true)
  );
});

const updateAllHeading = asyncHandler(async (req, res) => {
  const heading = req.body.heading !== undefined ? req.body.heading : (req.body.section_heading || "");
  const result = await CardBannerService.updateAllHeading(heading);
  res.json(
    new ApiResponse(200, result, "All card banners heading updated successfully", true)
  );
});

const deleteCardBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid card banner ID", false)
    );
  }

  const banner = await CardBannerService.deleteCardBanner(id);
  if (!banner) {
    return res.json(
      new ApiResponse(404, null, "Card banner not found", false)
    );
  }

  res.json(
    new ApiResponse(200, null, "Card banner deleted successfully", true)
  );
});

module.exports = {
  getAllCardBanners,
  getActiveCardBanners,
  getCardBannerById,
  createCardBanner,
  updateCardBanner,
  updateAllHeading,
  deleteCardBanner,
};
