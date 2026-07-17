const BundleRepository = require("../../repositories/bundle/index.js");

const getAllBundles = async ({
  page,
  per_page,
  category,
  sub_category,
  is_best_seller,
  search,
  price_range,
  sort_by,
  rating,
  brands,
  is_active,
}) => {
  return await BundleRepository.getAllBundles({
    page,
    per_page,
    category,
    sub_category,
    is_best_seller,
    search,
    price_range,
    sort_by,
    rating,
    brands,
    is_active,
  });
};

const getBundleById = async (id) => {
  return await BundleRepository.getBundleById(id);
};

const createBundle = async (data) => {
  return await BundleRepository.createBundle(data);
};

const updateBundle = async (id, data) => {
  return await BundleRepository.updateBundle(id, data);
};

const deleteBundle = async (id) => {
  return await BundleRepository.deleteBundle(id);
};

module.exports = {
  getAllBundles,
  getBundleById,
  createBundle,
  updateBundle,
  deleteBundle,
};
