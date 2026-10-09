const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const DealCampaignService = require("../../services/dealCampaign/index.js");
const mongoose = require("mongoose");

const extractIds = (raw) => {
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
  for (const item of raw) {
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
      else if (item.id) ids.push(String(item.id).trim());
    }
  }

  return [...new Set(ids.filter(Boolean))];
};

const getAllDealCampaigns = asyncHandler(async (req, res) => {
  const { page = 1, per_page = 50, is_active, apply_to, search } = req.query;

  const result = await DealCampaignService.getAllDealCampaigns({
    page,
    per_page,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
    apply_to,
    search,
  });

  res.json(new ApiResponse(200, result, "Deal campaigns fetched successfully", true));
});

const getActiveDealCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await DealCampaignService.getActiveDealCampaigns();
  res.json(new ApiResponse(200, campaigns, "Active deal campaigns fetched successfully", true));
});

const getDealCampaignById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid deal campaign ID", false));
  }

  const campaign = await DealCampaignService.getDealCampaignById(id);
  if (!campaign) {
    return res.json(new ApiResponse(404, null, "Deal campaign not found", false));
  }

  res.json(new ApiResponse(200, campaign, "Deal campaign fetched successfully", true));
});

const getCampaignForProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.json(new ApiResponse(400, null, "Invalid product ID", false));
  }

  const campaign = await DealCampaignService.getCampaignForProduct(productId);
  res.json(new ApiResponse(200, campaign, "Product deal campaign status fetched successfully", true));
});

const createDealCampaign = asyncHandler(async (req, res) => {
  const {
    title,
    sale_end_time,
    is_active,
    apply_to = "SPECIFIC_PRODUCTS",
  } = req.body;

  if (!sale_end_time) {
    return res.json(new ApiResponse(400, null, "sale_end_time is required", false));
  }

  const product_ids = extractIds(req.body.product_ids || req.body.products);
  const brand_ids = extractIds(req.body.brand_ids || req.body.brands);
  const category_ids = extractIds(req.body.category_ids || req.body.categories);

  const result = await DealCampaignService.createDealCampaign({
    title,
    sale_end_time,
    is_active: is_active !== undefined ? is_active === "true" || is_active === true : true,
    apply_to,
    product_ids,
    brand_ids,
    category_ids,
    created_by: req.admin?._id || req.user?._id || null,
  });

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  res.json(new ApiResponse(201, result.campaign, "Deal campaign created successfully", true));
});

const updateDealCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid deal campaign ID", false));
  }

  const updatePayload = {};
  if (req.body.title !== undefined) updatePayload.title = req.body.title;
  if (req.body.sale_end_time !== undefined) updatePayload.sale_end_time = req.body.sale_end_time;
  if (req.body.is_active !== undefined) {
    updatePayload.is_active = req.body.is_active === "true" || req.body.is_active === true;
  }
  if (req.body.apply_to !== undefined) updatePayload.apply_to = req.body.apply_to;

  if (req.body.product_ids !== undefined || req.body.products !== undefined) {
    updatePayload.product_ids = extractIds(req.body.product_ids || req.body.products);
  }
  if (req.body.brand_ids !== undefined || req.body.brands !== undefined) {
    updatePayload.brand_ids = extractIds(req.body.brand_ids || req.body.brands);
  }
  if (req.body.category_ids !== undefined || req.body.categories !== undefined) {
    updatePayload.category_ids = extractIds(req.body.category_ids || req.body.categories);
  }

  const result = await DealCampaignService.updateDealCampaign(id, updatePayload);

  if (!result.success) {
    return res.json(
      new ApiResponse(result.notFound ? 404 : 400, null, result.message, false)
    );
  }

  res.json(new ApiResponse(200, result.campaign, "Deal campaign updated successfully", true));
});

const toggleDealCampaignStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid deal campaign ID", false));
  }

  const result = await DealCampaignService.toggleCampaignStatus(id);

  if (!result.success) {
    return res.json(
      new ApiResponse(result.notFound ? 404 : 400, null, result.message, false)
    );
  }

  res.json(new ApiResponse(200, result.campaign, "Deal campaign status toggled successfully", true));
});

const deleteDealCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid deal campaign ID", false));
  }

  const campaign = await DealCampaignService.deleteDealCampaign(id);
  if (!campaign) {
    return res.json(new ApiResponse(404, null, "Deal campaign not found", false));
  }

  res.json(new ApiResponse(200, null, "Deal campaign deleted successfully", true));
});

module.exports = {
  getAllDealCampaigns,
  getActiveDealCampaigns,
  getDealCampaignById,
  getCampaignForProduct,
  createDealCampaign,
  updateDealCampaign,
  toggleDealCampaignStatus,
  deleteDealCampaign,
};
