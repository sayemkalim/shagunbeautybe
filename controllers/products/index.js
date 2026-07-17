const mongoose = require("mongoose");
const ApiResponse = require("../../utils/ApiResponse.js");
const ProductsServices = require("../../services/product/index.js");
const { asyncHandler } = require("../../common/asyncHandler.js");
const {
  uploadMultipleFiles,
  uploadSingleFile,
  uploadFromUrl,
  migrateImagesToCloudinary,
} = require("../../utils/upload/index.js");
const Product = require("../../models/productsModel.js");
const XLSX = require("xlsx");

const getAllProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    per_page = 10,
    price_range,
    category,
    rating,
    sub_category,
    is_best_seller,
    is_imported_picks,
    is_bakery,
    search,
    brands,
    sort_by = "created_at",
  } = req.query;

  // Handle comma-separated values for array parameters
  const processArrayParam = (param) => {
    if (!param) return undefined;
    
    // If it's already an array, return as is
    if (Array.isArray(param)) {
      return param;
    }
    
    // If it's a string with commas, split it
    if (typeof param === 'string' && param.includes(',')) {
      return param.split(',').map(item => item.trim()).filter(item => item);
    }
    
    // Single value, wrap in array
    return [param];
  };

  const processedCategory = processArrayParam(category);
  const processedSubCategory = processArrayParam(sub_category);
  const processedBrands = processArrayParam(brands);

  const products = await ProductsServices.getAllProducts({
    page: parseInt(page, 10),
    per_page: parseInt(per_page, 10),
    category: processedCategory,
    sub_category: processedSubCategory,
    is_best_seller,
    is_imported_picks,
    is_bakery,
    search,
    rating,
    price_range,
    brands: processedBrands,
    sort_by,
  });

  // Convert Decimal128 to numbers for all products
  if (products.data && Array.isArray(products.data)) {
    products.data = products.data.map((product) => {
      const convertedProduct = {
        ...product,
        sku: product.sku,
        price:
          product.price &&
          typeof product.price === "object" &&
          product.price.$numberDecimal
            ? parseFloat(product.price.$numberDecimal)
            : product.price && typeof product.price === "object"
            ? parseFloat(product.price.toString())
            : product.price,
        discounted_price:
          product.discounted_price &&
          typeof product.discounted_price === "object" &&
          product.discounted_price.$numberDecimal
            ? parseFloat(product.discounted_price.$numberDecimal)
            : product.discounted_price &&
              typeof product.discounted_price === "object"
            ? parseFloat(product.discounted_price.toString())
            : product.discounted_price,
      };

      // Handle variants
      if (Array.isArray(convertedProduct.variants)) {
        convertedProduct.variants = convertedProduct.variants.map(
          (variant) => ({
            ...variant,
            price:
              variant.price &&
              typeof variant.price === "object" &&
              variant.price.$numberDecimal
                ? parseFloat(variant.price.$numberDecimal)
                : variant.price && typeof variant.price === "object"
                ? parseFloat(variant.price.toString())
                : variant.price,
            discounted_price:
              variant.discounted_price &&
              typeof variant.discounted_price === "object" &&
              variant.discounted_price.$numberDecimal
                ? parseFloat(variant.discounted_price.$numberDecimal)
                : variant.discounted_price &&
                  typeof variant.discounted_price === "object"
                ? parseFloat(variant.discounted_price.toString())
                : variant.discounted_price,
          })
        );
      }

      return convertedProduct;
    });
  }

  res.json(
    new ApiResponse(200, products, "Products fetched successfully", true)
  );
});

const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid product ID", false));
  }

  const product = await ProductsServices.getProductById(id);
  if (!product) {
    return res.json(new ApiResponse(404, null, "Product not found", false));
  }

  res.json(new ApiResponse(200, product, "Product fetched successfully", true));
});

const createProduct = asyncHandler(async (req, res) => {
  const files = req.files || [];
  const images = files.filter((f) => f.fieldname === "images");
  const bannerImageFile = files.find((f) => f.fieldname === "banner_image");

  if (!images.length && !bannerImageFile) {
    return res.json(new ApiResponse(404, null, "No Images Found", false));
  }

  // SKU validation
  if (!req.body.sku || typeof req.body.sku !== "string" || !req.body.sku.trim()) {
    return res.status(400).json(new ApiResponse(400, null, "SKU is required and must be a non-empty string", false));
  }
  // Check uniqueness
  const existing = await Product.findOne({ sku: req.body.sku.trim() });
  if (existing) {
    return res.status(400).json(new ApiResponse(400, null, "SKU must be unique. This SKU already exists.", false));
  }

  const imageUrls = images.length
    ? await uploadMultipleFiles(images, "uploads/images")
    : [];

  const bannerImageUrl = bannerImageFile
    ? await uploadSingleFile(bannerImageFile.path, "uploads/images")
    : null;

  let { meta_data, variants } = req.body;

  if (meta_data) {
    try {
      meta_data = JSON.parse(meta_data);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid meta_data format", false)
      );
    }
  }

  if (variants && typeof variants === "string") {
    try {
      variants = JSON.parse(variants);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid variants format", false)
      );
    }
  }

  if (Array.isArray(variants)) {
    variants = await Promise.all(
      variants.map(async (variant, idx) => {
        const variantImageFiles = files.filter(
          (f) => f.fieldname === `variants[${idx}][images]`
        );
        if (variantImageFiles.length) {
          variant.images = await uploadMultipleFiles(
            variantImageFiles,
            "uploads/images"
          );
        } else {
          variant.images = [];
        }
        return variant;
      })
    );
  }

  const productData = {
    ...req.body,
    images: imageUrls,
    banner_image: bannerImageUrl,
    meta_data,
    variants,
  };

  if (productData.inventory === undefined) productData.inventory = 0;

  const product = await ProductsServices.createProduct(productData);
  res.json(new ApiResponse(201, product, "Product created successfully", true));
});

const updateProduct = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const product = await Product.findById(id);

  if (!product) {
    return res.json(new ApiResponse(404, null, "Product not found", false));
  }

  const files = req.files || [];
  // Handle product images: keep URLs, upload only new files
  let productImages = [];
  if (req.body.images) {
    let imagesArr = req.body.images;
    if (typeof imagesArr === "string") {
      try {
        imagesArr = JSON.parse(imagesArr);
      } catch {
        imagesArr = [imagesArr];
      }
    }
    productImages = await Promise.all(
      imagesArr.map(async (img, idx) => {
        if (img && typeof img === "object" && img.path) {
          // File object (shouldn't happen with upload.any, but for safety)
          return await uploadSingleFile(img.path, "uploads/images");
        } else if (typeof img === "string" && img.startsWith("http")) {
          return img;
        } else {
          // Check if a file was uploaded for this index
          const file = files.find(
            (f) => f.fieldname === `images` && f.originalname === img
          );
          if (file) {
            return await uploadSingleFile(file.path, "uploads/images");
          }
        }
        return null;
      })
    );
    productImages = productImages.filter(Boolean);
  } else {
    // If no images in body, check for uploaded files
    const imageFiles = files.filter((f) => f.fieldname === "images");
    productImages =
      imageFiles.length > 0
        ? await uploadMultipleFiles(imageFiles, "uploads/images")
        : product.images || [];
  }

  // Banner image: keep URL if string, upload if file
  let bannerImageUrl = product.banner_image;
  const bannerImageFile = files.find((f) => f.fieldname === "banner_image");
  if (bannerImageFile) {
    bannerImageUrl = await uploadSingleFile(
      bannerImageFile.path,
      "uploads/images"
    );
  } else if (
    req.body.banner_image &&
    typeof req.body.banner_image === "string" &&
    req.body.banner_image.startsWith("http")
  ) {
    bannerImageUrl = req.body.banner_image;
  }

  let { meta_data, variants } = req.body;

  if (meta_data) {
    try {
      meta_data = JSON.parse(meta_data);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid meta_data format", false)
      );
    }
  }

  if (variants && typeof variants === "string") {
    try {
      variants = JSON.parse(variants);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid variants format", false)
      );
    }
  }

  // For each variant, keep URLs, upload only new files
  if (Array.isArray(variants)) {
    variants = await Promise.all(
      variants.map(async (variant, idx) => {
        let variantImages = [];
        if (variant.images) {
          let vImgs = variant.images;
          if (typeof vImgs === "string") {
            try {
              vImgs = JSON.parse(vImgs);
            } catch {
              vImgs = [vImgs];
            }
          }
          variantImages = await Promise.all(
            vImgs.map(async (img, vIdx) => {
              if (img && typeof img === "object" && img.path) {
                return await uploadSingleFile(img.path, "uploads/images");
              } else if (typeof img === "string" && img.startsWith("http")) {
                return img;
              } else {
                // Check if a file was uploaded for this variant image
                const file = files.find(
                  (f) =>
                    f.fieldname === `variants[${idx}][images]` &&
                    f.originalname === img
                );
                if (file) {
                  return await uploadSingleFile(file.path, "uploads/images");
                }
              }
              return null;
            })
          );
          variantImages = variantImages.filter(Boolean);
        } else {
          // If no images in body, check for uploaded files
          const variantImageFiles = files.filter(
            (f) => f.fieldname === `variants[${idx}][images]`
          );
          variantImages =
            variantImageFiles.length > 0
              ? await uploadMultipleFiles(variantImageFiles, "uploads/images")
              : variant.images || [];
        }
        return { ...variant, images: variantImages };
      })
    );
  }

  const productData = {
    ...req.body,
    images: productImages,
    banner_image: bannerImageUrl,
    meta_data,
    variants,
  };

  if (productData.inventory === undefined)
    productData.inventory = product.inventory || 0;

  const updatedProduct = await ProductsServices.updateProduct(id, productData);

  res.json(
    new ApiResponse(200, updatedProduct, "Product updated successfully", true)
  );
});

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await ProductsServices.deleteProduct(req.params.id);
  if (!product) {
    return res.json(new ApiResponse(404, null, "Product not found", false));
  }

  res.json(new ApiResponse(200, null, "Product deleted successfully", true));
});

const getProductRecommendations = asyncHandler(async (req, res) => {
  const { product_id, page = 1, per_page = 10 } = req.query;

  if (!product_id) {
    return res.json(new ApiResponse(400, null, "Product ID is required", false));
  }

  if (!mongoose.Types.ObjectId.isValid(product_id)) {
    return res.json(new ApiResponse(400, null, "Invalid product ID", false));
  }

  const recommendations = await ProductsServices.getProductRecommendations(product_id, {
    page: parseInt(page, 10),
    per_page: parseInt(per_page, 10)
  });

  res.json(new ApiResponse(200, recommendations, "Product recommendations fetched successfully", true));
});

const checkProductPurchased = asyncHandler(async (req, res) => {
  const { product_id } = req.query;
  const userId = req.user?._id;

  if (!product_id) {
    return res.json(new ApiResponse(400, null, "Product ID is required", false));
  }

  if (!mongoose.Types.ObjectId.isValid(product_id)) {
    return res.json(new ApiResponse(400, null, "Invalid product ID", false));
  }

  if (!userId) {
    return res.json(new ApiResponse(401, null, "User not authenticated", false));
  }

  const isPurchased = await ProductsServices.checkProductPurchased(product_id, userId);

  res.json(new ApiResponse(200, { 
    is_purchased: isPurchased,
    product_id: product_id 
  }, isPurchased ? "Product has been purchased" : "Product not purchased", true));
});

const getProductsByAdmin = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.json(new ApiResponse(404, null, "Admin not found", false));
  }

  const { page = 1, per_page = 10, search } = req.query;

  const products = await ProductsServices.getProductsByAdmin({
    id: adminId,
    page,
    per_page,
    search,
  });

  res.json(
    new ApiResponse(200, products, "Product fetched successfully", true)
  );
});

const bulkCreateProducts = asyncHandler(async (req, res) => {
  const products = req.body;
  const adminId = req.admin._id;

  if (!adminId) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Admin not found", false));
  }

  if (!products?.length) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "No products provided", false));
  }

  const result = await ProductsServices.bulkCreateProducts(products, adminId);

  res
    .status(207)
    .json(new ApiResponse(207, result, "Batch processing completed", true));
});

const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const { productIds, updates } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "productIds must be a non-empty array", false));
  }

  // Validate all IDs are valid ObjectIds
  const invalidIds = productIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, `Invalid product IDs: ${invalidIds.join(", ")}`, false));
  }

  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "updates must be a non-empty object", false));
  }

  // Only allow status and inventory fields
  const allowedFields = ["status", "inventory"];
  const updateKeys = Object.keys(updates);
  const disallowedKeys = updateKeys.filter((k) => !allowedFields.includes(k));
  if (disallowedKeys.length > 0) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, `Disallowed fields: ${disallowedKeys.join(", ")}. Only status and inventory are allowed.`, false));
  }

  // Validate field values
  if (updates.status !== undefined && !["published", "draft"].includes(updates.status)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "status must be 'published' or 'draft'", false));
  }
  if (updates.inventory !== undefined && ![0, 1].includes(updates.inventory)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "inventory must be 0 or 1", false));
  }

  const result = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: updates }
  );

  res.json(
    new ApiResponse(200, { updated: result.modifiedCount, productIds }, "Products updated successfully", true)
  );
});

const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { uploadPDF } = require("../../utils/upload/index.js");

// Helper: Convert array of objects to CSV
function convertToCSV(arr) {
  if (!arr.length) return "";
  const header = Object.keys(arr[0]).join(",");
  const rows = arr.map((obj) =>
    Object.values(obj)
      .map((v) => (typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v))
      .join(",")
  );
  return [header, ...rows].join("\n");
}

// Helper: Convert array of objects to XLSX using xlsx library
function convertToXLSX(arr) {
  const ws = XLSX.utils.json_to_sheet(arr);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const exportProducts = asyncHandler(async (req, res) => {
  const fileType = req.query.fileType?.toLowerCase() || "xlsx";
  const startDate = req.query.start_date
    ? new Date(req.query.start_date)
    : null;
  const endDate = req.query.end_date ? new Date(req.query.end_date) : null;

  const filter = {};
  if (startDate && endDate) {
    filter.createdAt = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    filter.createdAt = { $gte: startDate };
  } else if (endDate) {
    filter.createdAt = { $lte: endDate };
  }

  const products = await Product.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: "subcategories",
        localField: "sub_category",
        foreignField: "_id",
        as: "subCategoryData",
      },
    },
    {
      $addFields: {
        categoryId: { $arrayElemAt: ["$subCategoryData.category", 0] }
      }
    },
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "categoryData",
      },
    },
    {
      $lookup: {
        from: "brands",
        localField: "brand",
        foreignField: "_id",
        as: "brandData",
      },
    },
    {
      $addFields: {
        sub_category_name: { $arrayElemAt: ["$subCategoryData.name", 0] },
        category_name: { $arrayElemAt: ["$categoryData.name", 0] },
        brand_name: { $arrayElemAt: ["$brandData.name", 0] },
      },
    },
    {
      $project: {
        subCategoryData: 0,
        categoryData: 0,
        brandData: 0,
        categoryId: 0,
      },
    },
  ]);

  // Flatten variants for export
  const serializedProducts = products.flatMap((p) => {
    const { __v, _id, createdAt, updatedAt, variants, sub_category, brand, ...rest } = p;
    
    // Handle price conversion more robustly
    const handlePrice = (priceField) => {
      if (!priceField) return priceField;
      if (typeof priceField === 'object' && priceField.$numberDecimal) {
        return parseFloat(priceField.$numberDecimal);
      }
      if (typeof priceField === 'object' && priceField.toString) {
        return parseFloat(priceField.toString());
      }
      return priceField;
    };

    const baseProductData = {
      id: p._id.toString(),
      createdAt: createdAt?.toISOString(),
      updatedAt: updatedAt?.toISOString(),
      ...rest,
      price: handlePrice(p.price),
      discounted_price: handlePrice(p.discounted_price),
      category_name: p.category_name || "",
      sub_category_name: p.sub_category_name || "",
      brand_name: p.brand_name || "",
    };
    
    if (Array.isArray(variants) && variants.length > 0) {
      return variants.map((variant) => ({
        ...baseProductData,
        variant_sku: variant.sku || "",
        variant_name: variant.name || "",
        variant_attributes: JSON.stringify(variant.attributes || {}),
        variant_price: handlePrice(variant.price),
        variant_discounted_price: handlePrice(variant.discounted_price),
        variant_inventory: variant.inventory || "",
        variant_images: Array.isArray(variant.images)
          ? variant.images.join("|")
          : "",
      }));
    } else {
      return [
        {
          ...baseProductData,
          variant_sku: "",
          variant_name: "",
          variant_attributes: "",
          variant_price: "",
          variant_discounted_price: "",
          variant_inventory: "",
          variant_images: "",
        },
      ];
    }
  });

  let buffer;
  let mimeType = "";
  const currentDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
  const currentTime = new Date()
    .toTimeString()
    .split(" ")[0]
    .replace(/:/g, "-"); // HH-MM-SS format
  let filename = `products_export_${currentDate}_${currentTime}.${fileType}`;

  if (fileType === "csv") {
    const content = convertToCSV(serializedProducts);
    buffer = Buffer.from(content, "utf-8");
    mimeType = "text/csv";
  } else if (fileType === "xlsx") {
    buffer = convertToXLSX(serializedProducts);
    mimeType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Unsupported file type", false));
  }

  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, filename);
  await fs.writeFile(tempFilePath, buffer);

  const url = await uploadPDF(tempFilePath, "exports");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { url, mimeType, filename },
        "Products exported and uploaded successfully",
        true
      )
    );
});

const generateSampleFile = asyncHandler(async (req, res) => {
  const fileType = req.query.fileType?.toLowerCase() || "xlsx";

  try {
    // Fetch all categories and sub-categories for dropdown options
    const Category = require("../../models/categoryModel.js");
    const SubCategory = require("../../models/subCategoryModel.js");

    const categories = await Category.find({ is_active: true }).lean();
    const subCategories = await SubCategory.find({ is_active: true })
      .populate("category")
      .lean();

    // Create category and sub-category mappings with null checks
    const categoryOptions = categories
      .map((cat) => `${cat.name} (${cat._id})`)
      .join(" | ");
    const subCategoryOptions = subCategories
      .filter((subCat) => subCat.category && subCat.category._id) // Filter out sub-categories without valid categories
      .map((subCat) => `${subCat.name} (${subCat._id})`)
      .join(" | ");

    // Create column headers with dropdown options
    const columnHeaders = {
      name: "Product Name (Required)",
      small_description: "Small Description (Required)",
      full_description: "Full Description (Optional)",
      price: "Price (Required) - Number only, no currency symbols",
      discounted_price: "Discounted Price (Optional) - Number only",
      inventory: "Inventory (Optional) - Number",
      tags: "Tags (Optional) - Comma separated",
      is_best_seller: "Is Best Seller (Optional) - 'true' or 'false'",
      is_imported_picks: "Is Imported Picks (Optional) - 'true' or 'false'",
      is_bakery: "Is Bakery (Optional) - 'true' or 'false'",
      celiacFriendly: "Celiac Friendly (Optional) - 'true' or 'false'",
      sub_category: `Sub Category (Required) - Select from: ${subCategoryOptions}`,
      category: `Category (Optional) - Select from: ${categoryOptions}`,
      manufacturer: "Manufacturer (Optional)",
      consumed_type: "Consumed Type (Optional)",
      expiry_date: "Expiry Date (Optional) - YYYY-MM-DD format",
      brand: "Brand ID (Optional)",
      meta_data: 'Meta Data (Optional) - JSON format: {"key": "value"}',
      // Variant fields
      variant_sku: "Variant SKU (Required if product has variants)",
      variant_name: "Variant Name (Optional)",
      variant_attributes: "Variant Attributes (Optional) - JSON format",
      variant_price: "Variant Price (Required if product has variants)",
      variant_discounted_price: "Variant Discounted Price (Optional)",
      variant_inventory: "Variant Inventory (Optional)",
      variant_images:
        "Variant Images (Optional) - Pipe separated: image1.jpg|image2.jpg",
    };

    // Create instructions sheet
    const instructions = [
      {
        field: "Required Fields",
        description: "These fields must be filled",
        example: "name, price, sub_category",
      },
      {
        field: "Optional Fields",
        description: "These fields can be left empty",
        example: "discounted_price, tags, meta_data",
      },
      {
        field: "Creating Dropdowns",
        description: "To create dropdowns for categories and sub-categories:",
        example:
          "1. Select the column 2. Data > Data Validation > List 3. Source: =Categories or =SubCategories",
      },
      {
        field: "sub_category",
        description: "Select from the dropdown options provided",
        example: "Use the exact format: SubCategory Name (ID)",
      },
      {
        field: "category",
        description: "Select from the dropdown options provided",
        example: "Use the exact format: Category Name (ID)",
      },
      {
        field: "price",
        description: "Must be a number (no currency symbols)",
        example: "1000 (not $1000)",
      },
      {
        field: "is_best_seller",
        description: "Must be 'true' or 'false' (string)",
        example: "true or false",
      },
      {
        field: "is_imported_picks",
        description: "Must be 'true' or 'false' (string)",
        example: "true or false",
      },
      {
        field: "is_bakery",
        description: "Must be 'true' or 'false' (string)",
        example: "true or false",
      },
      {
        field: "tags",
        description: "Comma-separated values",
        example: "tag1,tag2,tag3",
      },
      {
        field: "meta_data",
        description: "Valid JSON format",
        example: '{"key": "value"}',
      },
      {
        field: "variant_*",
        description: "Only fill if product has variants",
        example: "Leave empty for simple products",
      },
      {
        field: "Excel Dropdown Setup",
        description: "Manual dropdown creation steps:",
        example:
          "1. Go to Data tab 2. Click Data Validation 3. Select 'List' 4. Reference: =Categories or =SubCategories",
      },
    ];

    let buffer;
    let mimeType = "";
    const currentDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
    const currentTime = new Date()
      .toTimeString()
      .split(" ")[0]
      .replace(/:/g, "-"); // HH-MM-SS format
    let filename = `product_template_${currentDate}_${currentTime}.${fileType}`;

    if (fileType === "csv") {
      const headers = Object.keys(columnHeaders);
      const content = headers.join(",") + "\n";
      buffer = Buffer.from(content, "utf-8");
      mimeType = "text/csv";
    } else if (fileType === "xlsx") {
      // Create workbook with just one sheet
      const wb = XLSX.utils.book_new();

      // Create the main data with sample rows for dropdown validation
      const categoryIds = categories.map((cat) => `${cat.name} (${cat._id})`);
      const subCategoryIds = subCategories
        .filter((subCat) => subCat.category && subCat.category._id)
        .map((subCat) => `${subCat.name} (${subCat._id})`);

      // Create sample data with dropdown options in the cells
      const sampleData = [
        {
          name: "Product Name (Required)",
          small_description: "Small Description (Required)",
          full_description: "Full Description (Optional)",
          price: "Price (Required) - Number only",
          discounted_price: "Discounted Price (Optional)",
          inventory: "Inventory (Optional) - Number",
          tags: "Tags (Optional) - Comma separated",
          is_best_seller: "Is Best Seller (Optional) - 'true' or 'false'",
          is_imported_picks: "Is Imported Picks (Optional) - 'true' or 'false'",
          is_bakery: "Is Bakery (Optional) - 'true' or 'false'",
          celiacFriendly: "Celiac Friendly (Optional) - 'true' or 'false'",
          sub_category: `Sub Category (Required) - Select from: ${subCategoryIds.join(
            " | "
          )}`,
          category: `Category (Optional) - Select from: ${categoryIds.join(
            " | "
          )}`,
          manufacturer: "Manufacturer (Optional)",
          consumed_type: "Consumed Type (Optional)",
          expiry_date: "Expiry Date (Optional) - YYYY-MM-DD",
          brand: "Brand ID (Optional)",
          meta_data: "Meta Data (Optional) - JSON format",
          variant_sku: "Variant SKU (Required if variants)",
          variant_name: "Variant Name (Optional)",
          variant_attributes: "Variant Attributes (Optional) - JSON",
          variant_price: "Variant Price (Required if variants)",
          variant_discounted_price: "Variant Discounted Price (Optional)",
          variant_inventory: "Variant Inventory (Optional)",
          variant_images: "Variant Images (Optional) - Pipe separated",
        },
        {
          name: "",
          small_description: "",
          full_description: "",
          price: "",
          discounted_price: "",
          inventory: "",
          tags: "",
          is_best_seller: "",
          is_imported_picks: "",
          is_bakery: "",
          celiacFriendly: "",
          sub_category: "",
          category: "",
          manufacturer: "",
          consumed_type: "",
          expiry_date: "",
          brand: "",
          meta_data: "",
          variant_sku: "",
          variant_name: "",
          variant_attributes: "",
          variant_price: "",
          variant_discounted_price: "",
          variant_inventory: "",
          variant_images: "",
        },
      ];

      // Create the worksheet
      const ws = XLSX.utils.json_to_sheet(sampleData);

      // Add data validation for dropdowns
      ws["!dataValidation"] = {
        "I2:I1000": {
          // sub_category column
          type: "list",
          formula1: `"${subCategoryIds.join(",")}"`,
          allowBlank: false,
          showErrorMessage: true,
          errorTitle: "Invalid Sub-Category",
          error: "Please select a valid sub-category from the dropdown list.",
        },
        "J2:J1000": {
          // category column
          type: "list",
          formula1: `"${categoryIds.join(",")}"`,
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: "Invalid Category",
          error: "Please select a valid category from the dropdown list.",
        },
      };

      XLSX.utils.book_append_sheet(wb, ws, "Product Template");

      buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      mimeType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      return res.json(
        new ApiResponse(400, null, "Unsupported file type", false)
      );
    }

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, filename);
    await fs.writeFile(tempFilePath, buffer);

    const url = await uploadPDF(tempFilePath, "exports");

    return res.json(
      new ApiResponse(
        200,
        {
          url,
          mimeType,
          filename,
          categories: categories.length,
          subCategories: subCategories.length,
          instructions:
            "Check the Instructions sheet for detailed guidance. Use Categories and Sub-Categories sheets to create dropdowns manually.",
          columns: Object.keys(columnHeaders).length,
          dropdownSetup:
            "To create dropdowns: 1. Select category/sub-category column 2. Data > Data Validation > List 3. Source: =Categories or =SubCategories",
        },
        "Product template file generated successfully",
        true
      )
    );
  } catch (error) {
    console.error("Template file generation error:", error);
    return res.json(
      new ApiResponse(
        500,
        null,
        `Template file generation failed: ${error.message}`,
        false
      )
    );
  }
});

/**
 * Migrate all images of a product to Cloudinary
 * Takes all images (banner_image, images array, variant images) and re-uploads them to Cloudinary
 */
const migrateProductImagesToCloudinary = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid product ID", false));
  }

  const product = await Product.findById(id);
  if (!product) {
    return res.json(new ApiResponse(404, null, "Product not found", false));
  }

  const cloudinaryFolder = "products";
  const migrationResults = {
    banner_image: { old: null, new: null, status: "skipped" },
    images: [],
    variants: [],
  };

  try {
    // Migrate banner_image
    if (product.banner_image && !product.banner_image.includes("res.cloudinary.com")) {
      migrationResults.banner_image.old = product.banner_image;
      const newBannerUrl = await uploadFromUrl(product.banner_image, cloudinaryFolder);
      product.banner_image = newBannerUrl;
      migrationResults.banner_image.new = newBannerUrl;
      migrationResults.banner_image.status = "migrated";
    } else if (product.banner_image) {
      migrationResults.banner_image.status = "already_cloudinary";
    }

    // Migrate product images array
    if (Array.isArray(product.images) && product.images.length > 0) {
      const newImages = [];
      for (const imgUrl of product.images) {
        const imageResult = { old: imgUrl, new: null, status: "skipped" };
        
        if (imgUrl && !imgUrl.includes("res.cloudinary.com")) {
          const newUrl = await uploadFromUrl(imgUrl, cloudinaryFolder);
          newImages.push(newUrl);
          imageResult.new = newUrl;
          imageResult.status = "migrated";
        } else if (imgUrl) {
          newImages.push(imgUrl);
          imageResult.status = "already_cloudinary";
        }
        
        migrationResults.images.push(imageResult);
      }
      product.images = newImages;
    }

    // Migrate variant images
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      for (let i = 0; i < product.variants.length; i++) {
        const variant = product.variants[i];
        const variantResult = {
          variant_sku: variant.sku,
          images: [],
        };

        if (Array.isArray(variant.images) && variant.images.length > 0) {
          const newVariantImages = [];
          for (const imgUrl of variant.images) {
            const imageResult = { old: imgUrl, new: null, status: "skipped" };
            
            if (imgUrl && !imgUrl.includes("res.cloudinary.com")) {
              const newUrl = await uploadFromUrl(imgUrl, cloudinaryFolder);
              newVariantImages.push(newUrl);
              imageResult.new = newUrl;
              imageResult.status = "migrated";
            } else if (imgUrl) {
              newVariantImages.push(imgUrl);
              imageResult.status = "already_cloudinary";
            }
            
            variantResult.images.push(imageResult);
          }
          product.variants[i].images = newVariantImages;
        }
        
        migrationResults.variants.push(variantResult);
      }
    }

    // Save the updated product
    await product.save();

    // Count migrated images
    const totalMigrated = 
      (migrationResults.banner_image.status === "migrated" ? 1 : 0) +
      migrationResults.images.filter(img => img.status === "migrated").length +
      migrationResults.variants.reduce((acc, v) => acc + v.images.filter(img => img.status === "migrated").length, 0);

    res.json(
      new ApiResponse(
        200,
        {
          product_id: product._id,
          product_name: product.name,
          total_images_migrated: totalMigrated,
          migration_details: migrationResults,
        },
        `Successfully migrated ${totalMigrated} image(s) to Cloudinary`,
        true
      )
    );
  } catch (error) {
    res.json(
      new ApiResponse(
        500,
        { error: error.message, partial_results: migrationResults },
        "Error during image migration",
        false
      )
    );
  }
});

/**
 * Migrate all images of ALL products to Cloudinary (bulk operation)
 * Use with caution - this can take a long time for large catalogs
 */
const migrateAllProductsImagesToCloudinary = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query; // Default to 10 products at a time to avoid timeout

  const cloudinaryFolder = "products";
  
  // Find products that have images NOT on Cloudinary
  const products = await Product.find({
    $or: [
      { banner_image: { $exists: true, $ne: null, $not: /res\.cloudinary\.com/ } },
      { images: { $elemMatch: { $not: /res\.cloudinary\.com/ } } },
      { "variants.images": { $elemMatch: { $not: /res\.cloudinary\.com/ } } },
    ],
  }).limit(parseInt(limit, 10));

  if (products.length === 0) {
    return res.json(
      new ApiResponse(200, { migrated_count: 0 }, "All product images are already on Cloudinary", true)
    );
  }

  const results = {
    total_products_processed: 0,
    total_images_migrated: 0,
    products: [],
  };

  for (const product of products) {
    const productResult = {
      product_id: product._id,
      product_name: product.name,
      images_migrated: 0,
      errors: [],
    };

    try {
      // Migrate banner_image
      if (product.banner_image && !product.banner_image.includes("res.cloudinary.com")) {
        product.banner_image = await uploadFromUrl(product.banner_image, cloudinaryFolder);
        productResult.images_migrated++;
      }

      // Migrate product images array
      if (Array.isArray(product.images) && product.images.length > 0) {
        const newImages = [];
        for (const imgUrl of product.images) {
          if (imgUrl && !imgUrl.includes("res.cloudinary.com")) {
            const newUrl = await uploadFromUrl(imgUrl, cloudinaryFolder);
            newImages.push(newUrl);
            productResult.images_migrated++;
          } else if (imgUrl) {
            newImages.push(imgUrl);
          }
        }
        product.images = newImages;
      }

      // Migrate variant images
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        for (let i = 0; i < product.variants.length; i++) {
          const variant = product.variants[i];
          if (Array.isArray(variant.images) && variant.images.length > 0) {
            const newVariantImages = [];
            for (const imgUrl of variant.images) {
              if (imgUrl && !imgUrl.includes("res.cloudinary.com")) {
                const newUrl = await uploadFromUrl(imgUrl, cloudinaryFolder);
                newVariantImages.push(newUrl);
                productResult.images_migrated++;
              } else if (imgUrl) {
                newVariantImages.push(imgUrl);
              }
            }
            product.variants[i].images = newVariantImages;
          }
        }
      }

      await product.save();
      results.total_products_processed++;
      results.total_images_migrated += productResult.images_migrated;
    } catch (error) {
      productResult.errors.push(error.message);
    }

    results.products.push(productResult);
  }

  // Count remaining products to migrate
  const remainingCount = await Product.countDocuments({
    $or: [
      { banner_image: { $exists: true, $ne: null, $not: /res\.cloudinary\.com/ } },
      { images: { $elemMatch: { $not: /res\.cloudinary\.com/ } } },
      { "variants.images": { $elemMatch: { $not: /res\.cloudinary\.com/ } } },
    ],
  });

  results.remaining_products = remainingCount;

  res.json(
    new ApiResponse(
      200,
      results,
      `Migrated ${results.total_images_migrated} images from ${results.total_products_processed} products. ${remainingCount} products remaining.`,
      true
    )
  );
});

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductRecommendations,
  checkProductPurchased,
  getProductsByAdmin,
  bulkCreateProducts,
  bulkUpdateProducts,
  exportProducts,
  generateSampleFile,
  migrateProductImagesToCloudinary,
  migrateAllProductsImagesToCloudinary,
};
