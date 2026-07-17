const Category = require("../../models/categoryModel");

const getAllCategory = async ({
  service_id,
  search,
  sortOrder,
  skip,
  limit,
}) => {
  let filter = {};
  if (service_id) filter.service = service_id;
  if (search) filter.name = { $regex: search, $options: "i" };

  return await Category.find(filter).sort(sortOrder).skip(skip).limit(limit);
};

const countAllCategories = async ({ service_id, search }) => {
  let filter = {};
  if (service_id) filter.service = service_id;
  if (search) filter.name = { $regex: search, $options: "i" };

  return await Category.countDocuments(filter);
};

const getCategoryById = async (id) => {
  return await Category.findById(id);
};

const createCategory = async (data) => {
  return await Category.create(data);
};

const updateCategory = async (id, data) => {
  return await Category.findByIdAndUpdate(id, data, { new: true });
};

const deleteCategory = async (id) => {
  return await Category.findByIdAndDelete(id);
};

const getCategoriesByAdmin = async ({ id, filters, page, per_page }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  return await Category.find({ ...filters, created_by_admin: id })
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit);
};

module.exports = {
  getAllCategory,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  countAllCategories,
  getCategoriesByAdmin,
};
