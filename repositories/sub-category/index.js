const SubCategory = require("../../models/subCategoryModel.js");

const getAllSubCategories = async (filter = {}, skip = 0, limit = 50) => {
  const subCategories = await SubCategory.find(filter)
    .skip(skip)
    .limit(limit)
    .populate("category");
  
  const total = await SubCategory.countDocuments(filter);
  
  return {
    subCategories,
    total,
    page: Math.floor(skip / limit) + 1,
    per_page: limit,
    total_pages: Math.ceil(total / limit),
  };
};

const getSubCategoryById = async (id) => {
  return await SubCategory.findById(id).populate("category");
};

const createSubCategory = async (data) => {
  return await SubCategory.create(data);
};

const updateSubCategory = async (id, data) => {
  return await SubCategory.findByIdAndUpdate(id, data, { new: true });
};

const deleteSubCategory = async (id) => {
  return await SubCategory.findByIdAndDelete(id);
};

module.exports = {
  getAllSubCategories,
  getSubCategoryById,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
};
