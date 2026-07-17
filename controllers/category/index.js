const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const CategoryService = require("../../services/category/index.js");
const mongoose = require("mongoose");
const { uploadMultipleFiles } = require("../../utils/upload/index.js");

const getAllCategory = asyncHandler(async (req, res) => {
  const {
    service_id,
    page = 1,
    per_page = 50,
    search = "",
    sort = "latest",
  } = req.query;

  const categories = await CategoryService.getAllCategory({
    service_id,
    page,
    per_page,
    search,
    sort,
  });

  const result = {
    total: categories.length,
    ...categories,
  };
  res.json(
    new ApiResponse(200, result, "Categories fetched successfully", true)
  );
});

const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid category ID", false));
  }

  const category = await CategoryService.getCategoryById(id);
  if (!category) {
    return res.json(new ApiResponse(404, null, "Category not found", false));
  }

  res.json(
    new ApiResponse(200, category, "Category fetched successfully", true)
  );
});

const createCategory = asyncHandler(async (req, res) => {
  const images = req.files;
  if (!images) {
    return res.json(new ApiResponse(404, null, "No Image Found", false));
  }
  const imageUrls = await uploadMultipleFiles(images, "uploads/images");

  let categoryData = { ...req.body, images: imageUrls };

  if (categoryData?.meta_data) {
    categoryData.meta_data = JSON.parse(categoryData.meta_data);
  }

  const category = await CategoryService.createCategory(categoryData);
  res.json(
    new ApiResponse(201, category, "Category created successfully", true)
  );
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid category ID", false));
  }

  let categoryData = { ...req.body };

  if (req.files) {
    const imageUrls = await uploadMultipleFiles(req.files, "uploads/images");
    categoryData.images = imageUrls;
  }

  if (categoryData?.meta_data) {
    try {
      categoryData.meta_data = JSON.parse(categoryData.meta_data);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid meta_data format", false)
      );
    }
  }

  const updatedCategory = await CategoryService.updateCategory(
    id,
    categoryData
  );

  if (!updatedCategory) {
    return res.json(new ApiResponse(404, null, "Category not found", false));
  }

  res.json(
    new ApiResponse(200, updatedCategory, "Category updated successfully", true)
  );
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await CategoryService.deleteCategory(req.params.id);
  if (!category) {
    return res.json(new ApiResponse(404, null, "Category not found", false));
  }

  res.json(new ApiResponse(200, null, "Category deleted successfully", true));
});

const getCategoriesByAdmin = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.json(new ApiResponse(404, null, "Admin not found", false));
  }

  const { page = 1, per_page = 50, search = "" } = req.query;

  const categories = await CategoryService.getCategoriesByAdmin({
    id: adminId,
    page,
    per_page,
    search,
  });

  res.json(
    new ApiResponse(200, categories, "Categories fetched successfully", true)
  );
});

module.exports = {
  getAllCategory,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoriesByAdmin,
};
