const Brand = require("../../models/brandModel");

const getAllBrands = async ({
  service_id,
  search,
  sortOrder,
  skip,
  limit,
}) => {
  let filter = {};
  if (service_id) filter.service = service_id;
  if (search) filter.name = { $regex: search, $options: "i" };

  return await Brand.find(filter).sort(sortOrder).skip(skip).limit(limit);
};

const countAllBrands = async ({ service_id, search }) => {
  let filter = {};
  if (service_id) filter.service = service_id;
  if (search) filter.name = { $regex: search, $options: "i" };

  return await Brand.countDocuments(filter);
};

const getBrandById = async (id) => {
  return await Brand.findById(id);
};

const createBrand = async (data) => {
  return await Brand.create(data);
};

const updateBrand = async (id, data) => {
  return await Brand.findByIdAndUpdate(id, data, { new: true });
};

const deleteBrand = async (id) => {
  return await Brand.findByIdAndDelete(id);
};

const getBrandsByAdmin = async ({ id, filters, page, per_page }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  return await Brand.find({ ...filters, created_by_admin: id })
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit);
};

module.exports = {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  countAllBrands,
  getBrandsByAdmin,
};
