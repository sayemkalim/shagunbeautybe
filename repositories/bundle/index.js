const Bundle = require("../../models/bundleModel");
const Product = require("../../models/productsModel");
const SubCategory = require("../../models/subCategoryModel");

const getAllBundles = async ({
  page = 1,
  per_page = 50,
  category,
  sub_category,
  is_best_seller,
  search,
  rating,
  price_range,
  brands,
  sort_by,
  is_active,
}) => {
  const skip = (page - 1) * per_page;
  const match = {};

  // Handle search filter
  if (search) {
    match.name = { $regex: search, $options: "i" };
  }

  // Handle is_best_seller filter
  if (is_best_seller !== undefined && is_best_seller !== null) {
    const bestSellerValue = is_best_seller === 'true' || is_best_seller === true;
    match.is_best_seller = bestSellerValue;
  }

  // Handle price range filter
  if (price_range) {
    const priceRanges = Array.isArray(price_range) ? price_range : [price_range];
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

  // Handle is_active filter
  if (is_active !== undefined && is_active !== null) {
    const isActiveValue = is_active === 'true' || is_active === true;
    match.is_active = isActiveValue;
  }

  // Handle sort options
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

  // Build aggregation pipeline
  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "populatedProducts"
      }
    },
    {
      $addFields: {
        populatedProducts: {
          $map: {
            input: "$products",
            as: "bundleProduct",
            in: {
              $let: {
                vars: {
                  productDoc: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$populatedProducts",
                          cond: { $eq: ["$$this._id", "$$bundleProduct.product"] }
                        }
                      },
                      0
                    ]
                  }
                },
                in: {
                  product: "$$productDoc",
                  variant_sku: "$$bundleProduct.variant_sku"
                }
              }
            }
          }
        }
      }
    },
    {
      $unset: "products"
    }
  ];

  // Add category and sub_category filtering through products
  if (category || sub_category) {
    let subCategoryIds = [];
    
    if (category) {
      const categoryArray = Array.isArray(category) ? category : [category];
      const subCats = await SubCategory.find({ category: { $in: categoryArray } }, "_id");
      subCategoryIds = subCats.map((sc) => sc._id);
      if (sub_category) {
        const subCatArray = Array.isArray(sub_category) ? sub_category : [sub_category];
        subCategoryIds = subCategoryIds.filter((id) =>
          subCatArray.includes(id.toString())
        );
      }
    } else if (sub_category) {
      subCategoryIds = Array.isArray(sub_category) ? sub_category : [sub_category];
    }

    if (subCategoryIds.length > 0) {
      pipeline.push({
        $match: {
          "populatedProducts.product.sub_category": { $in: subCategoryIds }
        }
      });
    } else {
      return { data: [], total: 0 };
    }
  }

  // Add brands filtering through products
  if (brands) {
    pipeline.push({
      $match: {
        "populatedProducts.product.brand": { $in: Array.isArray(brands) ? brands : [brands] }
      }
    });
  }

  // Add rating filtering through products
  if (rating) {
    pipeline.push({
      $lookup: {
        from: "reviews",
        localField: "populatedProducts.product._id",
        foreignField: "productId",
        as: "productReviews"
      }
    });
    pipeline.push({
      $addFields: {
        avgRating: { $avg: "$productReviews.rating" }
      }
    });
    pipeline.push({
      $match: { avgRating: { $gte: Number(rating) } }
    });
  }

  // Add sorting, skip, and limit
  pipeline.push({ $sort: sortOptions });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: per_page });

  // Execute the pipeline
  const bundles = await Bundle.aggregate(pipeline);

  // Get total count
  const countPipeline = pipeline.filter(
    (stage) => !("$skip" in stage) && !("$limit" in stage) && !("$sort" in stage)
  );
  countPipeline.push({ $count: "total" });
  const totalResult = await Bundle.aggregate(countPipeline);
  const total = totalResult[0]?.total || 0;

  // Process and populate products with reviews
  const processedBundles = await Promise.all(
    bundles.map(async (bundle) => {
      // Convert bundle prices
      let bundlePrice = bundle.price;
      let bundleDiscountedPrice = bundle.discounted_price;
      if (bundlePrice && bundlePrice.$numberDecimal) {
        bundlePrice = parseFloat(bundlePrice.$numberDecimal);
      } else if (bundlePrice && bundlePrice.toString) {
        bundlePrice = parseFloat(bundlePrice.toString());
      }
      if (bundleDiscountedPrice && bundleDiscountedPrice.$numberDecimal) {
        bundleDiscountedPrice = parseFloat(bundleDiscountedPrice.$numberDecimal);
      } else if (bundleDiscountedPrice && bundleDiscountedPrice.toString) {
        bundleDiscountedPrice = parseFloat(bundleDiscountedPrice.toString());
      }

      // Process products and add reviews
      const processedProducts = await Promise.all(
        (bundle.populatedProducts || []).map(async (entry) => {
          if (!entry.product) return null;

          let productPrice = entry.product.price;
          let productDiscountedPrice = entry.product.discounted_price;
          if (productPrice && productPrice.$numberDecimal) {
            productPrice = parseFloat(productPrice.$numberDecimal);
          } else if (productPrice && productPrice.toString) {
            productPrice = parseFloat(productPrice.toString());
          }
          if (productDiscountedPrice && productDiscountedPrice.$numberDecimal) {
            productDiscountedPrice = parseFloat(productDiscountedPrice.$numberDecimal);
          } else if (productDiscountedPrice && productDiscountedPrice.toString) {
            productDiscountedPrice = parseFloat(productDiscountedPrice.toString());
          }

          // Get reviews for the product
          const reviews = await Product.aggregate([
            { $match: { _id: entry.product._id } },
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
          ]);

          const productWithReviews = reviews[0] || entry.product;
          productWithReviews.reviews = productWithReviews.reviews || [];
          productWithReviews.price = productPrice;
          productWithReviews.discounted_price = productDiscountedPrice;

          // Handle variants
          if (entry.variant_sku && Array.isArray(entry.product.variants)) {
            const variant = entry.product.variants.find(v => v.sku === entry.variant_sku);
            if (variant) {
              variant.price = variant.price && variant.price.$numberDecimal ? parseFloat(variant.price.$numberDecimal) : (variant.price && variant.price.toString ? parseFloat(variant.price.toString()) : variant.price);
              variant.discounted_price = variant.discounted_price && variant.discounted_price.$numberDecimal ? parseFloat(variant.discounted_price.$numberDecimal) : (variant.discounted_price && variant.discounted_price.toString ? parseFloat(variant.discounted_price.toString()) : variant.discounted_price);
              productWithReviews.selected_variant = variant;
            }
          }

          if (Array.isArray(productWithReviews.variants)) {
            productWithReviews.variants = productWithReviews.variants.map(variant => ({
              ...variant,
              price: variant.price && variant.price.$numberDecimal ? parseFloat(variant.price.$numberDecimal) : (variant.price && variant.price.toString ? parseFloat(variant.price.toString()) : variant.price),
              discounted_price: variant.discounted_price && variant.discounted_price.$numberDecimal ? parseFloat(variant.discounted_price.$numberDecimal) : (variant.discounted_price && variant.discounted_price.toString ? parseFloat(variant.discounted_price.toString()) : variant.discounted_price),
            }));
          }

          return productWithReviews;
        })
      );

      return {
        ...bundle,
        price: bundlePrice,
        discounted_price: bundleDiscountedPrice,
        products: processedProducts.filter(Boolean),
      };
    })
  );

  return {
    data: processedBundles,
    total,
  };
};

const getBundleById = async (id) => {
  const bundle = await Bundle.findById(id).lean();
  if (!bundle) {
    return null;
  }

  // Convert bundle prices
  let bundlePrice = bundle.price;
  let bundleDiscountedPrice = bundle.discounted_price;
  if (bundlePrice && bundlePrice.$numberDecimal) {
    bundlePrice = parseFloat(bundlePrice.$numberDecimal);
  } else if (bundlePrice && bundlePrice.toString) {
    bundlePrice = parseFloat(bundlePrice.toString());
  }
  if (bundleDiscountedPrice && bundleDiscountedPrice.$numberDecimal) {
    bundleDiscountedPrice = parseFloat(bundleDiscountedPrice.$numberDecimal);
  } else if (bundleDiscountedPrice && bundleDiscountedPrice.toString) {
    bundleDiscountedPrice = parseFloat(bundleDiscountedPrice.toString());
  }

  // Populate products and handle variants
  const populatedProducts = await Promise.all(
    (bundle.products || []).map(async (entry) => {
      const productDoc = await Product.findById(entry.product).lean();
      if (!productDoc) return null;

      let productPrice = productDoc.price;
      let productDiscountedPrice = productDoc.discounted_price;
      if (productPrice && productPrice.$numberDecimal) {
        productPrice = parseFloat(productPrice.$numberDecimal);
      } else if (productPrice && productPrice.toString) {
        productPrice = parseFloat(productPrice.toString());
      }
      if (productDiscountedPrice && productDiscountedPrice.$numberDecimal) {
        productDiscountedPrice = parseFloat(productDiscountedPrice.$numberDecimal);
      } else if (productDiscountedPrice && productDiscountedPrice.toString) {
        productDiscountedPrice = parseFloat(productDiscountedPrice.toString());
      }

      // Attach reviews
      const reviews = await Product.aggregate([
        { $match: { _id: productDoc._id } },
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
      ]);
      const productWithReviews = reviews[0] || productDoc;
      productWithReviews.reviews = productWithReviews.reviews || [];
      productWithReviews.price = productPrice;
      productWithReviews.discounted_price = productDiscountedPrice;

      // If variant_sku is present, attach only that variant
      if (entry.variant_sku && Array.isArray(productDoc.variants)) {
        const variant = productDoc.variants.find(v => v.sku === entry.variant_sku);
        if (variant) {
          variant.price = variant.price && variant.price.$numberDecimal ? parseFloat(variant.price.$numberDecimal) : (variant.price && variant.price.toString ? parseFloat(variant.price.toString()) : variant.price);
          variant.discounted_price = variant.discounted_price && variant.discounted_price.$numberDecimal ? parseFloat(variant.discounted_price.$numberDecimal) : (variant.discounted_price && variant.discounted_price.toString ? parseFloat(variant.discounted_price.toString()) : variant.discounted_price);
          productWithReviews.selected_variant = variant;
        }
      }

      if (Array.isArray(productWithReviews.variants)) {
        productWithReviews.variants = productWithReviews.variants.map(variant => ({
          ...variant,
          price: variant.price && variant.price.$numberDecimal ? parseFloat(variant.price.$numberDecimal) : (variant.price && variant.price.toString ? parseFloat(variant.price.toString()) : variant.price),
          discounted_price: variant.discounted_price && variant.discounted_price.$numberDecimal ? parseFloat(variant.discounted_price.$numberDecimal) : (variant.discounted_price && variant.discounted_price.toString ? parseFloat(variant.discounted_price.toString()) : variant.discounted_price),
        }));
      }

      return productWithReviews;
    })
  );

  return {
    ...bundle,
    price: bundlePrice,
    discounted_price: bundleDiscountedPrice,
    products: populatedProducts.filter(Boolean),
  };
};

const createBundle = async (data) => {
  return await Bundle.create(data);
};

const updateBundle = async (id, data) => {
  return await Bundle.findByIdAndUpdate(id, data, { new: true }).populate("products");
};

const deleteBundle = async (id) => {
  return await Bundle.findByIdAndDelete(id);
};

module.exports = {
  getAllBundles,
  getBundleById,
  createBundle,
  updateBundle,
  deleteBundle,
};
