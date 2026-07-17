const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const BundleService = require("../../services/bundle/index.js");
const mongoose = require("mongoose");
const { uploadMultipleFiles } = require("../../utils/upload/index.js");
const Product = require("../../models/productsModel.js");
const Bundle = require("../../models/bundleModel.js");
const XLSX = require("xlsx");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { uploadPDF } = require("../../utils/upload/index.js");

const getAllBundles = asyncHandler(async (req, res) => {
  const {
    page = 1,
    per_page = 50,
    price_range,
    category,
    rating,
    sub_category,
    is_best_seller,
    search,
    brands,
    sort_by = "created_at",
    is_active,
  } = req.query;

  const bundles = await BundleService.getAllBundles({
    page: parseInt(page, 10),
    per_page: parseInt(per_page, 10),
    category,
    sub_category,
    is_best_seller,
    search,
    rating,
    price_range,
    brands,
    sort_by,
    is_active,
  });

  // Convert Decimal128 to numbers for all bundles
  if (bundles.data && Array.isArray(bundles.data)) {
    bundles.data = bundles.data.map(bundle => {
      const convertedBundle = {
        ...bundle,
        price: bundle.price && typeof bundle.price === 'object' && bundle.price.$numberDecimal 
          ? parseFloat(bundle.price.$numberDecimal) 
          : (bundle.price && typeof bundle.price === 'object' ? parseFloat(bundle.price.toString()) : bundle.price),
        discounted_price: bundle.discounted_price && typeof bundle.discounted_price === 'object' && bundle.discounted_price.$numberDecimal
          ? parseFloat(bundle.discounted_price.$numberDecimal)
          : (bundle.discounted_price && typeof bundle.discounted_price === 'object' ? parseFloat(bundle.discounted_price.toString()) : bundle.discounted_price),
      };

      // Handle products within bundles
      if (Array.isArray(convertedBundle.products)) {
        convertedBundle.products = convertedBundle.products.map(product => {
          const convertedProduct = {
            ...product,
            sku: product.sku,
            price: product.price && typeof product.price === 'object' && product.price.$numberDecimal 
              ? parseFloat(product.price.$numberDecimal) 
              : (product.price && typeof product.price === 'object' ? parseFloat(product.price.toString()) : product.price),
            discounted_price: product.discounted_price && typeof product.discounted_price === 'object' && product.discounted_price.$numberDecimal
              ? parseFloat(product.discounted_price.$numberDecimal)
              : (product.discounted_price && typeof product.discounted_price === 'object' ? parseFloat(product.discounted_price.toString()) : product.discounted_price),
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
      }

      return convertedBundle;
    });
  }

  res.json(new ApiResponse(200, bundles, "Bundles fetched successfully", true));
});

const getBundleById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid bundle ID", false));
  }
  const bundle = await BundleService.getBundleById(id);
  if (!bundle) {
    return res.json(new ApiResponse(404, null, "Bundle not found", false));
  }
  res.json(new ApiResponse(200, bundle, "Bundle fetched successfully", true));
});

const createBundle = asyncHandler(async (req, res) => {
  let imageUrls = [];

  if (req.files && req.files.length > 0) {
    imageUrls = await uploadMultipleFiles(req.files, "uploads/images");
  }

  let bundleData = { ...req.body };

  if (imageUrls.length > 0) {
    bundleData.images = imageUrls;
  }

  if (bundleData?.meta_data) {
    bundleData.meta_data = JSON.parse(bundleData.meta_data);
  }

  if (bundleData.products) {
    if (!Array.isArray(bundleData.products)) {
      bundleData.products = [bundleData.products];
    }
    bundleData.products = bundleData.products.map((p) =>
      typeof p === "string" ? JSON.parse(p) : p
    );

    for (const entry of bundleData.products) {
      const productDoc = await Product.findById(entry.product).lean();
      if (!productDoc) {
        return res.json(new ApiResponse(400, null, `Product not found: ${entry.product}`, false));
      }
      if (Array.isArray(productDoc.variants) && productDoc.variants.length > 0) {
        if (!entry.variant_sku) {
          return res.json(new ApiResponse(400, null, `variant_sku is required for product with variants: ${productDoc.name}`, false));
        }

        const found = productDoc.variants.some(v => v.sku === entry.variant_sku);
        if (!found) {
          return res.json(new ApiResponse(400, null, `variant_sku '${entry.variant_sku}' not found in product: ${productDoc.name}`, false));
        }
      } else {
        entry.variant_sku = undefined;
      }
    }
  }

  bundleData.created_by_admin = req.admin._id;
  const bundle = await BundleService.createBundle(bundleData);
  res.json(new ApiResponse(201, bundle, "Bundle created successfully", true));
});

const updateBundle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid bundle ID", false));
  }
  let bundleData = { ...req.body };
  if (req.files && req.files.length > 0) {
    const imageUrls = await uploadMultipleFiles(req.files, "uploads/images");
    bundleData.images = imageUrls;
  }
  if (bundleData?.meta_data) {
    try {
      bundleData.meta_data = JSON.parse(bundleData.meta_data);
    } catch (error) {
      return res.json(
        new ApiResponse(400, null, "Invalid meta_data format", false)
      );
    }
  }
  const updatedBundle = await BundleService.updateBundle(id, bundleData);
  if (!updatedBundle) {
    return res.json(new ApiResponse(404, null, "Bundle not found", false));
  }
  res.json(
    new ApiResponse(200, updatedBundle, "Bundle updated successfully", true)
  );
});

const deleteBundle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid bundle ID", false));
  }
  const bundle = await BundleService.deleteBundle(id);
  if (!bundle) {
    return res.json(new ApiResponse(404, null, "Bundle not found", false));
  }
  res.json(new ApiResponse(200, null, "Bundle deleted successfully", true));
});

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
  XLSX.utils.book_append_sheet(wb, ws, "Bundles");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const exportBundles = asyncHandler(async (req, res) => {
  try {
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

    // Use aggregation to populate product details and category/sub-category names
    const bundles = await Bundle.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "products",
          localField: "products.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      {
        $addFields: {
          products: {
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
                            input: "$productDetails",
                            cond: { $eq: ["$$this._id", "$$bundleProduct.product"] }
                          }
                        },
                        0
                      ]
                    }
                  },
                  in: {
                    product: "$$productDoc",
                    variant_sku: "$$bundleProduct.variant_sku",
                    quantity: "$$bundleProduct.quantity"
                  }
                }
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          price: 1,
          discounted_price: 1,
          images: 1,
          is_active: 1,
          is_best_seller: 1,
          meta_data: 1,
          created_by_admin: 1,
          createdAt: 1,
          updatedAt: 1,
          products: 1
        }
      }
    ]);

    // Flatten bundles for export - each bundle becomes multiple rows (one per product)
    const serializedBundles = bundles.flatMap((bundle) => {
      const { __v, _id, createdAt, updatedAt, products, ...rest } = bundle;
      
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

      if (Array.isArray(bundle.products) && bundle.products.length > 0) {
        return bundle.products.map((entry) => {
          if (!entry.product) return null;

          // Convert product prices
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

          return {
            bundle_id: bundle._id.toString(),
            bundle_name: bundle.name,
            bundle_description: bundle.description,
            bundle_price: bundlePrice,
            bundle_discounted_price: bundleDiscountedPrice,
            bundle_is_best_seller: bundle.is_best_seller || false,
            bundle_is_active: bundle.is_active,
            bundle_created_at: createdAt?.toISOString(),
            bundle_updated_at: updatedAt?.toISOString(),
            product_id: entry.product._id.toString(),
            product_name: entry.product.name,
            product_small_description: entry.product.small_description,
            product_price: productPrice,
            product_discounted_price: productDiscountedPrice,
            product_inventory: entry.product.inventory,
            product_is_best_seller: entry.product.is_best_seller || false,
            variant_sku: entry.variant_sku || "",
            quantity: entry.quantity || 1,
            product_images: Array.isArray(entry.product.images) ? entry.product.images.join("|") : "",
            bundle_images: Array.isArray(bundle.images) ? bundle.images.join("|") : "",
            ...rest
          };
        }).filter(Boolean);
      } else {
        return [{
          bundle_id: bundle._id.toString(),
          bundle_name: bundle.name,
          bundle_description: bundle.description,
          bundle_price: bundlePrice,
          bundle_discounted_price: bundleDiscountedPrice,
          bundle_is_best_seller: bundle.is_best_seller || false,
          bundle_is_active: bundle.is_active,
          bundle_created_at: createdAt?.toISOString(),
          bundle_updated_at: updatedAt?.toISOString(),
          product_id: "",
          product_name: "",
          product_small_description: "",
          product_price: "",
          product_discounted_price: "",
          product_inventory: "",
          product_is_best_seller: "",
          variant_sku: "",
          quantity: "",
          product_images: "",
          bundle_images: Array.isArray(bundle.images) ? bundle.images.join("|") : "",
          ...rest
        }];
      }
    });

    let buffer;
    let mimeType = "";
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentTime = new Date().toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS format
    let filename = `bundles_export_${currentDate}_${currentTime}.${fileType}`;

    if (fileType === "csv") {
      const content = convertToCSV(serializedBundles);
      buffer = Buffer.from(content, "utf-8");
      mimeType = "text/csv";
    } else if (fileType === "xlsx") {
      buffer = convertToXLSX(serializedBundles);
      mimeType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      return res.json(new ApiResponse(400, null, "Unsupported file type", false));
    }

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, filename);
    await fs.writeFile(tempFilePath, buffer);

    const url = await uploadPDF(tempFilePath, "exports");

    return res.json(
      new ApiResponse(
        200,
        { url, mimeType, filename },
        "Bundles exported and uploaded successfully",
        true
      )
    );
  } catch (error) {
    console.error("Export error:", error);
    return res.json(new ApiResponse(500, null, `Export failed: ${error.message}`, false));
  }
});

const generateSampleFile = asyncHandler(async (req, res) => {
  const fileType = req.query.fileType?.toLowerCase() || "xlsx";
  
  try {
    // Fetch all categories, sub-categories, and products for dropdown options
    const Category = require("../../models/categoryModel.js");
    const SubCategory = require("../../models/subCategoryModel.js");
    const Product = require("../../models/productsModel.js");
    
    const categories = await Category.find({ is_active: true }).lean();
    const subCategories = await SubCategory.find({ is_active: true }).populate('category').lean();
    const products = await Product.find({ is_active: true }).lean();
    
    // Create category and sub-category mappings
    const categoryOptions = categories.map(cat => `${cat.name} (${cat._id})`).join(' | ');
    const subCategoryOptions = subCategories.map(subCat => `${subCat.name} (${subCat._id})`).join(' | ');
    const productOptions = products.map(prod => `${prod.name} (${prod._id})`).join(' | ');
    
    // Create column headers with dropdown options
    const columnHeaders = {
      bundle_name: "Bundle Name (Required)",
      bundle_description: "Bundle Description (Optional)",
      bundle_price: "Bundle Price (Required) - Number only, no currency symbols",
      bundle_discounted_price: "Bundle Discounted Price (Optional) - Number only",
      bundle_is_best_seller: "Bundle Is Best Seller (Optional) - 'true' or 'false'",
      bundle_is_active: "Bundle Is Active (Optional) - 'true' or 'false'",
      bundle_meta_data: "Bundle Meta Data (Optional) - JSON format: {\"key\": \"value\"}",
      // Product entries (JSON array format)
      products: "Products (Required) - JSON array: [{\"product\": \"PRODUCT_ID\", \"variant_sku\": \"SKU\", \"quantity\": 1}]",
      // Individual product fields for reference
      product_1_id: `Product 1 ID (Required) - Select from: ${productOptions}`,
      product_1_variant_sku: "Product 1 Variant SKU (Required if product has variants)",
      product_1_quantity: "Product 1 Quantity (Required) - Number",
      product_2_id: `Product 2 ID (Optional) - Select from: ${productOptions}`,
      product_2_variant_sku: "Product 2 Variant SKU (Required if product has variants)",
      product_2_quantity: "Product 2 Quantity (Optional) - Number",
      product_3_id: `Product 3 ID (Optional) - Select from: ${productOptions}`,
      product_3_variant_sku: "Product 3 Variant SKU (Required if product has variants)",
      product_3_quantity: "Product 3 Quantity (Optional) - Number"
    };

    // Create instructions sheet
    const instructions = [
      {
        field: "Required Fields",
        description: "These fields must be filled",
        example: "bundle_name, bundle_price, products"
      },
      {
        field: "Optional Fields",
        description: "These fields can be left empty",
        example: "bundle_discounted_price, bundle_meta_data"
      },
      {
        field: "bundle_price",
        description: "Must be a number (no currency symbols)",
        example: "5000 (not $5000)"
      },
      {
        field: "bundle_is_best_seller",
        description: "Must be 'true' or 'false' (string)",
        example: "true or false"
      },
      {
        field: "bundle_is_active",
        description: "Must be 'true' or 'false' (string)",
        example: "true or false"
      },
      {
        field: "bundle_meta_data",
        description: "Valid JSON format",
        example: '{"key": "value"}'
      },
      {
        field: "products",
        description: "JSON array of product objects",
        example: '[{"product": "PRODUCT_ID", "variant_sku": "SKU", "quantity": 1}]'
      },
      {
        field: "product_*_id",
        description: "Select from the product dropdown options",
        example: "Use the exact format: Product Name (ID)"
      },
      {
        field: "variant_sku",
        description: "Required only if product has variants",
        example: "Leave empty for products without variants"
      },
      {
        field: "quantity",
        description: "Number of items in bundle",
        example: "1, 2, 3, etc."
      }
    ];

    let buffer;
    let mimeType = "";
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentTime = new Date().toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS format
    let filename = `bundle_template_${currentDate}_${currentTime}.${fileType}`;

    if (fileType === "csv") {
      const headers = Object.keys(columnHeaders);
      const content = headers.join(",") + "\n";
      buffer = Buffer.from(content, "utf-8");
      mimeType = "text/csv";
    } else if (fileType === "xlsx") {
      // Create workbook with just one sheet
      const wb = XLSX.utils.book_new();
      
      // Create the main data with sample rows for dropdown validation
      const categoryIds = categories.map(cat => `${cat.name} (${cat._id})`);
      const subCategoryIds = subCategories
        .filter(subCat => subCat.category && subCat.category._id)
        .map(subCat => `${subCat.name} (${subCat._id})`);
      const productIds = products.map(prod => `${prod.name} (${prod._id})`);
      
      // Create sample data with dropdown options in the cells
      const sampleData = [
        {
          bundle_name: "Bundle Name (Required)",
          bundle_description: "Bundle Description (Optional)",
          bundle_price: "Bundle Price (Required) - Number only",
          bundle_discounted_price: "Bundle Discounted Price (Optional)",
          bundle_is_best_seller: "Bundle Is Best Seller (Optional) - 'true' or 'false'",
          bundle_is_active: "Bundle Is Active (Optional) - 'true' or 'false'",
          bundle_meta_data: "Bundle Meta Data (Optional) - JSON format",
          products: "Products (Required) - JSON array: [{\"product\": \"PRODUCT_ID\", \"variant_sku\": \"SKU\", \"quantity\": 1}]",
          product_1_id: `Product 1 ID (Required) - Select from: ${productIds.join(' | ')}`,
          product_1_variant_sku: "Product 1 Variant SKU (Required if product has variants)",
          product_1_quantity: "Product 1 Quantity (Required) - Number",
          product_2_id: `Product 2 ID (Optional) - Select from: ${productIds.join(' | ')}`,
          product_2_variant_sku: "Product 2 Variant SKU (Required if product has variants)",
          product_2_quantity: "Product 2 Quantity (Optional) - Number",
          product_3_id: `Product 3 ID (Optional) - Select from: ${productIds.join(' | ')}`,
          product_3_variant_sku: "Product 3 Variant SKU (Required if product has variants)",
          product_3_quantity: "Product 3 Quantity (Optional) - Number"
        },
        {
          bundle_name: "",
          bundle_description: "",
          bundle_price: "",
          bundle_discounted_price: "",
          bundle_is_best_seller: "",
          bundle_is_active: "",
          bundle_meta_data: "",
          products: "",
          product_1_id: "",
          product_1_variant_sku: "",
          product_1_quantity: "",
          product_2_id: "",
          product_2_variant_sku: "",
          product_2_quantity: "",
          product_3_id: "",
          product_3_variant_sku: "",
          product_3_quantity: ""
        }
      ];
      
      // Create the worksheet
      const ws = XLSX.utils.json_to_sheet(sampleData);
      
      // Add data validation for dropdowns
      ws['!dataValidation'] = {
        'I2:I1000': { // product_1_id column
          type: 'list',
          formula1: `"${productIds.join(',')}"`,
          allowBlank: false,
          showErrorMessage: true,
          errorTitle: 'Invalid Product 1',
          error: 'Please select a valid product from the dropdown list.'
        },
        'L2:L1000': { // product_2_id column
          type: 'list',
          formula1: `"${productIds.join(',')}"`,
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: 'Invalid Product 2',
          error: 'Please select a valid product from the dropdown list.'
        },
        'O2:O1000': { // product_3_id column
          type: 'list',
          formula1: `"${productIds.join(',')}"`,
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: 'Invalid Product 3',
          error: 'Please select a valid product from the dropdown list.'
        }
      };
      
      XLSX.utils.book_append_sheet(wb, ws, "Bundle Template");
      
      buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      return res.json(new ApiResponse(400, null, "Unsupported file type", false));
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
          products: products.length,
          instructions: "Check the Instructions sheet for detailed guidance",
          columns: Object.keys(columnHeaders).length
        },
        "Bundle template file generated successfully",
        true
      )
    );
  } catch (error) {
    console.error("Template file generation error:", error);
    return res.json(new ApiResponse(500, null, `Template file generation failed: ${error.message}`, false));
  }
});

module.exports = {
  getAllBundles,
  getBundleById,
  createBundle,
  updateBundle,
  deleteBundle,
  exportBundles,
  generateSampleFile,
};
