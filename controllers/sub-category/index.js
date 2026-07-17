const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const SubCategoryService = require("../../services/sub-category/index.js");
const mongoose = require("mongoose");
const { uploadMultipleFiles } = require("../../utils/upload/index.js");

const getAllSubCategories = asyncHandler(async (req, res) => {
  const { category, page = 1, per_page = 50, search = "" } = req.query;
  const subCategories = await SubCategoryService.getAllSubCategories({
    category,
    page,
    per_page,
    search,
  });
  res.json(
    new ApiResponse(
      200,
      subCategories,
      "SubCategories fetched successfully",
      true
    )
  );
});

const getSubCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid subcategory ID", false)
    );
  }
  const subCategory = await SubCategoryService.getSubCategoryById(id);
  if (!subCategory) {
    return res.json(new ApiResponse(404, null, "SubCategory not found", false));
  }
  res.json(
    new ApiResponse(200, subCategory, "SubCategory fetched successfully", true)
  );
});

const createSubCategory = asyncHandler(async (req, res) => {
  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    imageUrls = await uploadMultipleFiles(req.files, "uploads/images");
  }

  let subCategoryData = { ...req.body, images: imageUrls };
  if (subCategoryData?.meta_data) {
    subCategoryData.meta_data = JSON.parse(subCategoryData.meta_data);
  }
  const subCategory = await SubCategoryService.createSubCategory(
    subCategoryData
  );
  res.json(
    new ApiResponse(201, subCategory, "SubCategory created successfully", true)
  );
});

const updateSubCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(
      new ApiResponse(400, null, "Invalid subcategory ID", false)
    );
  }
  let subCategoryData = { ...req.body };
  if (req.files) {
    const imageUrls = await uploadMultipleFiles(req.files, "uploads/images");
    subCategoryData.images = imageUrls;
  }
  if (subCategoryData?.meta_data) {
    try {
      subCategoryData.meta_data = JSON.parse(subCategoryData.meta_data);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid meta_data format", false)
      );
    }
  }
  const updatedSubCategory = await SubCategoryService.updateSubCategory(
    id,
    subCategoryData
  );
  if (!updatedSubCategory) {
    return res.json(new ApiResponse(404, null, "SubCategory not found", false));
  }
  res.json(
    new ApiResponse(
      200,
      updatedSubCategory,
      "SubCategory updated successfully",
      true
    )
  );
});

const deleteSubCategory = asyncHandler(async (req, res) => {
  const subCategory = await SubCategoryService.deleteSubCategory(req.params.id);
  if (!subCategory) {
    return res.json(new ApiResponse(404, null, "SubCategory not found", false));
  }
  res.json(
    new ApiResponse(200, null, "SubCategory deleted successfully", true)
  );
});

module.exports = {
  getAllSubCategories,
  getSubCategoryById,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
};
