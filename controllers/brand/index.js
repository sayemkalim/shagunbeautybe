const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const BrandService = require("../../services/brand/index.js");
const mongoose = require("mongoose");
const { uploadMultipleFiles } = require("../../utils/upload/index.js");
const Brand = require("../../models/brandModel.js");

const getAllBrands = asyncHandler(async (req, res) => {
  const {
    service_id,
    page = 1,
    per_page = 50,
    search = "",
    sort = "latest",
  } = req.query;

  const brands = await BrandService.getAllBrands({
    service_id,
    page,
    per_page,
    search,
    sort,
  });

  const result = {
    total: brands.length,
    ...brands,
  };
  res.json(new ApiResponse(200, result, "Brands fetched successfully", true));
});

const getBrandById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid brand ID", false));
  }

  const brand = await BrandService.getBrandById(id);
  if (!brand) {
    return res.json(new ApiResponse(404, null, "Brand not found", false));
  }

  res.json(new ApiResponse(200, brand, "Brand fetched successfully", true));
});

const createBrand = asyncHandler(async (req, res) => {
  const images = req.files;
  if (!images) {
    return res.json(new ApiResponse(404, null, "No Image Found", false));
  }

  if (req.body.slug) {
    const existing = await Brand.findOne({ slug: req.body.slug });
    if (existing) {
      return res.json(
        new ApiResponse(
          409,
          null,
          "Slug already exists. Please use a unique slug.",
          false
        )
      );
    }
  }

  const imageUrls = await uploadMultipleFiles(images, "uploads/images");

  let brandData = { ...req.body, images: imageUrls };

  if (brandData?.meta_data) {
    brandData.meta_data = JSON.parse(brandData.meta_data);
  }

  const brand = await BrandService.createBrand(brandData);
  res.json(new ApiResponse(201, brand, "Brand created successfully", true));
});

const updateBrand = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid brand ID", false));
  }

  if (req.body.slug) {
    const existing = await Brand.findOne({ slug: req.body.slug });
    if (existing) {
      return res.json(
        new ApiResponse(
          409,
          null,
          "Slug already exists. Please use a unique slug.",
          false
        )
      );
    }
  }

  let brandData = { ...req.body };

  if (req.files) {
    const imageUrls = await uploadMultipleFiles(req.files, "uploads/images");
    brandData.images = imageUrls;
  }

  if (brandData?.meta_data) {
    try {
      brandData.meta_data = JSON.parse(brandData.meta_data);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid meta_data format", false)
      );
    }
  }

  const updatedBrand = await BrandService.updateBrand(id, brandData);

  if (!updatedBrand) {
    return res.json(new ApiResponse(404, null, "Brand not found", false));
  }

  res.json(
    new ApiResponse(200, updatedBrand, "Brand updated successfully", true)
  );
});

const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await BrandService.deleteBrand(req.params.id);
  if (!brand) {
    return res.json(new ApiResponse(404, null, "Brand not found", false));
  }

  res.json(new ApiResponse(200, null, "Brand deleted successfully", true));
});

const getBrandsByAdmin = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.json(new ApiResponse(404, null, "Admin not found", false));
  }

  const { page = 1, per_page = 50, search = "" } = req.query;

  const brands = await BrandService.getBrandsByAdmin({
    id: adminId,
    page,
    per_page,
    search,
  });

  res.json(new ApiResponse(200, brands, "Brands fetched successfully", true));
});

module.exports = {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandsByAdmin,
};
