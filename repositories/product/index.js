const mongoose = require("mongoose");
const Product = require("../../models/productsModel");
const SubCategory = require("../../models/subCategoryModel");
const Category = require("../../models/categoryModel");
const Brand = require("../../models/brandModel");
const { convertToObjectIds } = require("../../utils/objectIdHelper");

const getAllProducts = async ({
  page,
  per_page,
  category,
  sub_category,
  is_best_seller,
  is_imported_picks,
  is_bakery,
  search,
  rating,
  price_range,
  brands,
  sort_by,
}) => {
  const skip = (page - 1) * per_page;
  const match = {};

  let subCategoryIds = [];
  if (category) {
    const categoryArray = Array.isArray(category) ? category : [category];
    
    // Find categories by ID or name (slug alternative)
    const categoryIds = [];
    const categoryNames = [];
    
    categoryArray.forEach(cat => {
      if (mongoose.Types.ObjectId.isValid(cat)) {
        categoryIds.push(new mongoose.Types.ObjectId(cat));
      } else {
        // Normalize: replace hyphens with spaces for matching
        const normalizedName = cat.replace(/-/g, ' ');
        categoryNames.push(normalizedName);
      }
    });
    
    // Build query for categories
    const categoryQuery = [];
    if (categoryIds.length > 0) {
      categoryQuery.push({ _id: { $in: categoryIds } });
    }
    if (categoryNames.length > 0) {
      // Case-insensitive regex match for names (each name gets its own regex)
      categoryNames.forEach(name => {
        categoryQuery.push({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
      });
    }
    
    if (categoryQuery.length === 0) {
      return { data: [], total: 0 };
    }
    
    // Find matching categories
    const foundCategories = await Category.find({ $or: categoryQuery }, "_id");
    const foundCategoryIds = foundCategories.map(c => c._id);
    
    if (foundCategoryIds.length === 0) {
      return { data: [], total: 0 };
    }
    
    const subCats = await SubCategory.find({ category: { $in: foundCategoryIds } }, "_id");
    subCategoryIds = subCats.map((sc) => sc._id);
    
    if (sub_category) {
      const subCatArray = Array.isArray(sub_category) ? sub_category : [sub_category];
      
      // Find sub-categories by ID or name
      const subCatIds = [];
      const subCatNames = [];
      
      subCatArray.forEach(subCat => {
        if (mongoose.Types.ObjectId.isValid(subCat)) {
          subCatIds.push(new mongoose.Types.ObjectId(subCat));
        } else {
          // Normalize: replace hyphens with spaces for matching
          const normalizedName = subCat.replace(/-/g, ' ');
          subCatNames.push(normalizedName);
        }
      });
      
      const subCatQuery = [];
      if (subCatIds.length > 0) {
        subCatQuery.push({ _id: { $in: subCatIds } });
      }
      if (subCatNames.length > 0) {
        // Case-insensitive regex match for names (each name gets its own regex)
        subCatNames.forEach(name => {
          subCatQuery.push({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        });
      }
      
      if (subCatQuery.length > 0) {
        const foundSubCats = await SubCategory.find({ $or: subCatQuery }, "_id");
        const foundSubCatIds = foundSubCats.map(sc => sc._id.toString());
        subCategoryIds = subCategoryIds.filter((id) => foundSubCatIds.includes(id.toString()));
      }
    }
    
    if (subCategoryIds.length > 0) {
      match.sub_category = { $in: subCategoryIds };
    } else {
      return { data: [], total: 0 };
    }
  } else if (sub_category) {
    console.log("Filtering by sub_category only:", sub_category);
    
    const subCatArray = Array.isArray(sub_category) ? sub_category : [sub_category];
    
    // Find sub-categories by ID or name
    const subCatIds = [];
    const subCatNames = [];
    
    subCatArray.forEach(subCat => {
      if (mongoose.Types.ObjectId.isValid(subCat)) {
        subCatIds.push(new mongoose.Types.ObjectId(subCat));
      } else {
        // Normalize: replace hyphens with spaces for matching
        const normalizedName = subCat.replace(/-/g, ' ');
        subCatNames.push(normalizedName);
      }
    });
    
    const subCatQuery = [];
    if (subCatIds.length > 0) {
      subCatQuery.push({ _id: { $in: subCatIds } });
    }
    if (subCatNames.length > 0) {
      // Case-insensitive regex match for names (each name gets its own regex)
      subCatNames.forEach(name => {
        subCatQuery.push({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
      });
    }
    
    if (subCatQuery.length === 0) {
      return { data: [], total: 0 };
    }
    
    const foundSubCats = await SubCategory.find({ $or: subCatQuery }, "_id");
    
    if (foundSubCats.length === 0) {
      return { data: [], total: 0 };
    }
    
    match.sub_category = { $in: foundSubCats.map(sc => sc._id) };
    console.log("Match object for sub_category:", match.sub_category);
  }

  if (is_best_seller !== undefined && is_best_seller !== null) {
    const bestSellerValue = is_best_seller === 'true' || is_best_seller === true;
    match.is_best_seller = bestSellerValue;
  }
  
  if (is_imported_picks !== undefined && is_imported_picks !== null) {
    const importedPicksValue = is_imported_picks === 'true' || is_imported_picks === true;
    match.is_imported_picks = importedPicksValue;
  }
  
  if (is_bakery !== undefined && is_bakery !== null) {
    const bakeryValue = is_bakery === 'true' || is_bakery === true;
    match.is_bakery = bakeryValue;
  }

  if (search) {
    match.name = { $regex: search, $options: "i" };
  }

  if (brands) {
    const brandArray = Array.isArray(brands) ? brands : [brands];
    
    // Find brands by ID or slug
    const brandIds = [];
    const brandSlugs = [];
    
    brandArray.forEach(brand => {
      if (mongoose.Types.ObjectId.isValid(brand)) {
        brandIds.push(new mongoose.Types.ObjectId(brand));
      } else {
        brandSlugs.push(brand);
      }
    });
    
    const brandQuery = [];
    if (brandIds.length > 0) {
      brandQuery.push({ _id: { $in: brandIds } });
    }
    if (brandSlugs.length > 0) {
      brandQuery.push({ slug: { $in: brandSlugs } });
    }
    
    if (brandQuery.length > 0) {
      const foundBrands = await Brand.find({ $or: brandQuery }, "_id");
      if (foundBrands.length > 0) {
        match.brand = { $in: foundBrands.map(b => b._id) };
      }
    }
  }

  if (price_range) {
    const priceRanges = Array.isArray(price_range)
      ? price_range
      : [price_range];
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    priceRanges.forEach((range) => {
      if (typeof range === "string") {
        const prices = range.split("_").map(Number);
        if (prices.length === 2 && !isNaN(prices[0]) && !isNaN(prices[1])) {
          minPrice = Math.min(minPrice, prices[0]);
          maxPrice = Math.max(maxPrice, prices[1]);
        } else if (prices.length === 1 && !isNaN(prices[0])) {
          minPrice = Math.min(minPrice, prices[0]);
        }
      }
    });
    if (minPrice !== Infinity && maxPrice !== -Infinity) {
      match.price = { $gte: minPrice, $lte: maxPrice };
    } else if (minPrice !== Infinity) {
      match.price = { $gte: minPrice };
    }
  }

  let sortOptions = {};
  switch (sort_by) {
    case "latest":
    case "created_at":
      sortOptions = { createdAt: -1 };
      break;
    case "high_to_low":
      sortOptions = { price: -1 };
      break;
    case "low_to_high":
      sortOptions = { price: 1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }



  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "reviews",
        localField: "_id",
        foreignField: "productId",
        as: "reviews",
      },
    },
    {
      $addFields: {
        avgRating: { $avg: "$reviews.rating" },
        reviewsCount: { $size: "$reviews" },
      },
    },
  ];

  if (rating) {
    pipeline.push({ $match: { avgRating: { $gte: Number(rating) } } });
  }

  pipeline.push({ $sort: sortOptions });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: per_page });

  const products = await Product.aggregate(pipeline);

  const countPipeline = pipeline.filter(
    (stage) =>
      !("$skip" in stage) && !("$limit" in stage) && !("$sort" in stage)
  );
  countPipeline.push({ $count: "total" });
  const totalResult = await Product.aggregate(countPipeline);
  const total = totalResult[0]?.total || 0;

  // Convert Decimal128 to numbers for all products
  const productsWithReviews = products.map((product) => {
    const convertedProduct = {
      ...product,
      price: product.price && typeof product.price === 'object' && product.price.$numberDecimal 
        ? parseFloat(product.price.$numberDecimal) 
        : (product.price && typeof product.price === 'object' ? parseFloat(product.price.toString()) : product.price),
      discounted_price: product.discounted_price && typeof product.discounted_price === 'object' && product.discounted_price.$numberDecimal
        ? parseFloat(product.discounted_price.$numberDecimal)
        : (product.discounted_price && typeof product.discounted_price === 'object' ? parseFloat(product.discounted_price.toString()) : product.discounted_price),
      reviews: product.reviews || [],
    };

    // Handle variants
    if (Array.isArray(convertedProduct.variants)) {
      convertedProduct.variants = convertedProduct.variants.map(variant => ({
        ...variant,
        price: variant.price && typeof variant.price === 'object' && variant.price.$numberDecimal
          ? parseFloat(variant.price.$numberDecimal)
          : (variant.price && typeof variant.price === 'object' ? parseFloat(variant.price.toString()) : variant.price),
        discounted_price: variant.discounted_price && typeof variant.discounted_price === 'object' && variant.discounted_price.$numberDecimal
          ? parseFloat(variant.discounted_price.$numberDecimal)
          : (variant.discounted_price && typeof variant.discounted_price === 'object' ? parseFloat(variant.discounted_price.toString()) : variant.discounted_price),
      }));
    }

    return convertedProduct;
  });

  return {
    data: productsWithReviews,
    total,
  };
};

const getProductById = async (id) => {
  return await Product.findById(id).populate('brand');
};

const createProduct = async (data) => {
  return await Product.create(data);
};

const updateProduct = async (id, data) => {
  return await Product.findByIdAndUpdate(id, data, { new: true });
};

const deleteProduct = async (id) => {
  return await Product.findByIdAndDelete(id);
};

const getProductsByAdmin = async ({ id, filters, page, per_page }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page);

  return await Product.find({ ...filters, created_by_admin: id })
    .populate('brand')
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit);
};

const bulkCreateProducts = async (productsData) => {
  try {
    if (!Array.isArray(productsData)) {
      throw new Error("Input must be an array of product data");
    }

    const createdProducts = await Product.insertMany(productsData, {
      ordered: true, // Change to true to get proper error messages
    });

    return createdProducts;
  } catch (error) {
    if (error.writeErrors) {
      const errors = error.writeErrors.map((err) => ({
        index: err.index,
        error: err.errmsg,
      }));
      throw new Error(
        `Bulk create failed for some products: ${JSON.stringify(errors)}`
      );
    } else {
      throw new Error(`Bulk create failed: ${error.message}`);
    }
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByAdmin,
  bulkCreateProducts,
};
