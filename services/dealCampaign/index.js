const DealCampaignRepository = require("../../repositories/dealCampaign/index.js");
const DealCampaign = require("../../models/dealCampaignModel.js");
const Product = require("../../models/productsModel.js");
const Brand = require("../../models/brandModel.js");
const Category = require("../../models/categoryModel.js");
const SubCategory = require("../../models/subCategoryModel.js");
const mongoose = require("mongoose");

const getAllDealCampaigns = async ({
  page = 1,
  per_page = 50,
  is_active,
  apply_to,
  search,
}) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  const campaigns = await DealCampaignRepository.getAllDealCampaigns({
    skip,
    limit,
    is_active,
    apply_to,
    search,
  });

  const total = await DealCampaignRepository.countAllDealCampaigns({
    is_active,
    apply_to,
    search,
  });

  return {
    total,
    page: parseInt(page, 10),
    per_page: limit,
    total_pages: Math.ceil(total / per_page) || 1,
    campaigns,
  };
};

const getActiveDealCampaigns = async () => {
  return await DealCampaignRepository.getActiveDealCampaigns();
};

const getDealCampaignById = async (id) => {
  return await DealCampaignRepository.getDealCampaignById(id);
};

const validateTargetEntities = async ({ apply_to, product_ids, brand_ids, category_ids }) => {
  if (apply_to === "SPECIFIC_PRODUCTS") {
    if (!product_ids || product_ids.length === 0) {
      return { success: false, message: "At least one product is required for SPECIFIC_PRODUCTS" };
    }
    const found = await Product.find({ _id: { $in: product_ids } }).select("_id");
    if (found.length !== product_ids.length) {
      return { success: false, message: "One or more specified products were not found" };
    }
  } else if (apply_to === "BY_BRAND") {
    if (!brand_ids || brand_ids.length === 0) {
      return { success: false, message: "At least one brand is required for BY_BRAND" };
    }
    const found = await Brand.find({ _id: { $in: brand_ids } }).select("_id");
    if (found.length !== brand_ids.length) {
      return { success: false, message: "One or more specified brands were not found" };
    }
  } else if (apply_to === "BY_CATEGORY") {
    if (!category_ids || category_ids.length === 0) {
      return { success: false, message: "At least one category is required for BY_CATEGORY" };
    }
    const found = await Category.find({ _id: { $in: category_ids } }).select("_id");
    if (found.length !== category_ids.length) {
      return { success: false, message: "One or more specified categories were not found" };
    }
  }
  return { success: true };
};

const createDealCampaign = async (data) => {
  const { title, sale_end_time, apply_to = "SPECIFIC_PRODUCTS", product_ids = [], brand_ids = [], category_ids = [], is_active = true, created_by } = data;

  if (!sale_end_time || isNaN(new Date(sale_end_time).getTime())) {
    return { success: false, message: "A valid sale_end_time date is required" };
  }

  const validation = await validateTargetEntities({
    apply_to,
    product_ids,
    brand_ids,
    category_ids,
  });

  if (!validation.success) {
    return validation;
  }

  const campaignData = {
    title: title && title.trim() ? title.trim() : "Lowest Price Live",
    sale_end_time: new Date(sale_end_time),
    is_active: Boolean(is_active),
    apply_to,
    product_ids: apply_to === "SPECIFIC_PRODUCTS" ? product_ids : [],
    brand_ids: apply_to === "BY_BRAND" ? brand_ids : [],
    category_ids: apply_to === "BY_CATEGORY" ? category_ids : [],
    created_by: created_by || null,
  };

  const campaign = await DealCampaignRepository.createDealCampaign(campaignData);
  return { success: true, campaign };
};

const updateDealCampaign = async (id, data) => {
  const existing = await DealCampaign.findById(id);
  if (!existing) {
    return { success: false, notFound: true, message: "Deal campaign not found" };
  }

  const apply_to = data.apply_to !== undefined ? data.apply_to : existing.apply_to;
  const product_ids = data.product_ids !== undefined ? data.product_ids : existing.product_ids;
  const brand_ids = data.brand_ids !== undefined ? data.brand_ids : existing.brand_ids;
  const category_ids = data.category_ids !== undefined ? data.category_ids : existing.category_ids;

  if (data.sale_end_time !== undefined && isNaN(new Date(data.sale_end_time).getTime())) {
    return { success: false, message: "Invalid sale_end_time format" };
  }

  const validation = await validateTargetEntities({
    apply_to,
    product_ids,
    brand_ids,
    category_ids,
  });

  if (!validation.success) {
    return validation;
  }

  const updateData = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.sale_end_time !== undefined) updateData.sale_end_time = new Date(data.sale_end_time);
  if (data.is_active !== undefined) updateData.is_active = Boolean(data.is_active);
  if (data.apply_to !== undefined) {
    updateData.apply_to = data.apply_to;
    if (data.apply_to === "SPECIFIC_PRODUCTS") {
      updateData.product_ids = product_ids;
      updateData.brand_ids = [];
      updateData.category_ids = [];
    } else if (data.apply_to === "BY_BRAND") {
      updateData.brand_ids = brand_ids;
      updateData.product_ids = [];
      updateData.category_ids = [];
    } else if (data.apply_to === "BY_CATEGORY") {
      updateData.category_ids = category_ids;
      updateData.product_ids = [];
      updateData.brand_ids = [];
    } else if (data.apply_to === "ALL_PRODUCTS") {
      updateData.product_ids = [];
      updateData.brand_ids = [];
      updateData.category_ids = [];
    }
  } else {
    if (data.product_ids !== undefined) updateData.product_ids = product_ids;
    if (data.brand_ids !== undefined) updateData.brand_ids = brand_ids;
    if (data.category_ids !== undefined) updateData.category_ids = category_ids;
  }

  const campaign = await DealCampaignRepository.updateDealCampaign(id, updateData);
  return { success: true, campaign };
};

const toggleCampaignStatus = async (id) => {
  const existing = await DealCampaign.findById(id);
  if (!existing) {
    return { success: false, notFound: true, message: "Deal campaign not found" };
  }

  existing.is_active = !existing.is_active;
  await existing.save();

  const campaign = await DealCampaignRepository.getDealCampaignById(id);
  return { success: true, campaign };
};

const deleteDealCampaign = async (id) => {
  return await DealCampaignRepository.deleteDealCampaign(id);
};

const getCampaignForProduct = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return null;
  }

  const product = await Product.findById(productId)
    .populate({
      path: "sub_category",
      select: "category",
    })
    .select("_id brand sub_category");

  if (!product) return null;

  const now = new Date();
  const activeCampaigns = await DealCampaign.find({
    is_active: true,
    sale_end_time: { $gt: now },
  }).sort({ sale_end_time: 1, createdAt: -1 });

  if (activeCampaigns.length === 0) return null;

  const prodIdStr = product._id.toString();
  const brandIdStr = product.brand ? product.brand.toString() : null;
  const catIdStr =
    product.sub_category && product.sub_category.category
      ? product.sub_category.category.toString()
      : null;

  // 1. Check SPECIFIC_PRODUCTS
  let matched = activeCampaigns.find(
    (c) =>
      c.apply_to === "SPECIFIC_PRODUCTS" &&
      c.product_ids.some((id) => id.toString() === prodIdStr)
  );

  // 2. Check BY_BRAND
  if (!matched && brandIdStr) {
    matched = activeCampaigns.find(
      (c) =>
        c.apply_to === "BY_BRAND" &&
        c.brand_ids.some((id) => id.toString() === brandIdStr)
    );
  }

  // 3. Check BY_CATEGORY
  if (!matched && catIdStr) {
    matched = activeCampaigns.find(
      (c) =>
        c.apply_to === "BY_CATEGORY" &&
        c.category_ids.some((id) => id.toString() === catIdStr)
    );
  }

  // 4. Check ALL_PRODUCTS
  if (!matched) {
    matched = activeCampaigns.find((c) => c.apply_to === "ALL_PRODUCTS");
  }

  if (!matched) return null;

  return {
    _id: matched._id,
    title: matched.title,
    sale_end_time: matched.sale_end_time,
    is_active: matched.is_active,
    apply_to: matched.apply_to,
  };
};

module.exports = {
  getAllDealCampaigns,
  getActiveDealCampaigns,
  getDealCampaignById,
  createDealCampaign,
  updateDealCampaign,
  toggleCampaignStatus,
  deleteDealCampaign,
  getCampaignForProduct,
};
