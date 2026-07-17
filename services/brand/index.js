const BrandRepository = require("../../repositories/brand/index.js");

const getAllBrands = async ({ service_id, page, per_page, search, sort }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);
  const sortOrder = sort === "latest" ? { createdAt: -1 } : { createdAt: 1 };

  const brands = await BrandRepository.getAllBrands({
    service_id,
    search,
    sortOrder,
    skip,
    limit,
  });

  const total = await BrandRepository.countAllBrands({
    service_id,
    search,
  });

  return {
    total,
    page,
    per_page,
    total_pages: Math.ceil(total / per_page),
    brands,
  };
};

const getBrandById = async (id) => {
  return await BrandRepository.getBrandById(id);
};

const createBrand = async (data) => {
  return await BrandRepository.createBrand(data);
};

const updateBrand = async (id, data) => {
  return await BrandRepository.updateBrand(id, data);
};

const deleteBrand = async (id) => {
  return await BrandRepository.deleteBrand(id);
};

const getBrandsByAdmin = async ({ id, search, page, per_page }) => {
  const filters = {
    ...(search && { name: { $regex: search, $options: "i" } }),
  };
  return await BrandRepository.getBrandsByAdmin({
    id,
    filters,
    page,
    per_page,
  });
};

module.exports = {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandsByAdmin,
};
