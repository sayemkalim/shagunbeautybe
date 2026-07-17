const mongoose = require("mongoose");
const SubCategoryRepository = require("../../repositories/sub-category/index.js");
const Category = require("../../models/categoryModel.js");

const getAllSubCategories = async ({
  category,
  page = 1,
  per_page = 50,
  search = "",
}) => {
  const skip = (page - 1) * per_page;
  const filter = {};
  
  if (category) {
    // Check if category is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = new mongoose.Types.ObjectId(category);
    } else {
      // Normalize the category name: replace hyphens with spaces and use case-insensitive search
      const normalizedCategory = category.replace(/-/g, ' ');
      
      // Try to find category by name (case-insensitive, flexible matching)
      const foundCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${normalizedCategory}$`, 'i') }
      }, "_id");
      
      if (foundCategory) {
        filter.category = foundCategory._id;
      } else {
        // If category name not found, return empty result
        return {
          subCategories: [],
          total: 0,
          page: parseInt(page, 10),
          per_page: parseInt(per_page, 10),
          total_pages: 0,
        };
      }
    }
  }
  
  if (search) filter.name = { $regex: search, $options: "i" };
  
  return await SubCategoryRepository.getAllSubCategories(
    filter,
    skip,
    per_page
  );
};

const getSubCategoryById = async (id) => {
  return await SubCategoryRepository.getSubCategoryById(id);
};

const createSubCategory = async (data) => {
  return await SubCategoryRepository.createSubCategory(data);
};

const updateSubCategory = async (id, data) => {
  return await SubCategoryRepository.updateSubCategory(id, data);
};

const deleteSubCategory = async (id) => {
  return await SubCategoryRepository.deleteSubCategory(id);
};

module.exports = {
  getAllSubCategories,
  getSubCategoryById,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
};
