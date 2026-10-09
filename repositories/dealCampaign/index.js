const DealCampaign = require("../../models/dealCampaignModel.js");

const populateFields = [
  {
    path: "product_ids",
    select: "name sku price discounted_price banner_image images status inventory is_out_of_stock",
  },
  {
    path: "brand_ids",
    select: "name slug images is_active",
  },
  {
    path: "category_ids",
    select: "name images is_active",
  },
  {
    path: "created_by",
    select: "name email",
  },
];

const getAllDealCampaigns = async ({ skip = 0, limit = 50, is_active, apply_to, search }) => {
  const filter = {};

  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  if (apply_to) {
    filter.apply_to = apply_to;
  }

  if (search && search.trim()) {
    filter.title = { $regex: search.trim(), $options: "i" };
  }

  return await DealCampaign.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate(populateFields);
};

const countAllDealCampaigns = async ({ is_active, apply_to, search }) => {
  const filter = {};

  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  if (apply_to) {
    filter.apply_to = apply_to;
  }

  if (search && search.trim()) {
    filter.title = { $regex: search.trim(), $options: "i" };
  }

  return await DealCampaign.countDocuments(filter);
};

const getActiveDealCampaigns = async () => {
  const now = new Date();
  return await DealCampaign.find({
    is_active: true,
    sale_end_time: { $gt: now },
  })
    .sort({ sale_end_time: 1, createdAt: -1 })
    .populate(populateFields);
};

const getDealCampaignById = async (id) => {
  return await DealCampaign.findById(id).populate(populateFields);
};

const createDealCampaign = async (data) => {
  const created = await DealCampaign.create(data);
  return await DealCampaign.findById(created._id).populate(populateFields);
};

const updateDealCampaign = async (id, data) => {
  return await DealCampaign.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).populate(populateFields);
};

const deleteDealCampaign = async (id) => {
  return await DealCampaign.findByIdAndDelete(id);
};

module.exports = {
  getAllDealCampaigns,
  countAllDealCampaigns,
  getActiveDealCampaigns,
  getDealCampaignById,
  createDealCampaign,
  updateDealCampaign,
  deleteDealCampaign,
};
