const mongoose = require("mongoose");
const Inventory = require("../../models/inventoryModel");
const StockMovement = require("../../models/stockMovementModel");

const findBySku = async (sku) => {
  return await Inventory.findOne({ sku });
};

const findByProductAndVariant = async (productId, variantSku = null) => {
  return await Inventory.findOne({
    product: productId,
    variant_sku: variantSku,
  });
};

const createInventory = async (data) => {
  return await Inventory.create(data);
};

const updateQuantity = async (inventoryId, quantity, extra = {}) => {
  return await Inventory.findByIdAndUpdate(
    inventoryId,
    { $set: { quantity_on_hand: quantity, ...extra } },
    { new: true },
  );
};

const updateThreshold = async (sku, lowStockThreshold) => {
  return await Inventory.findOneAndUpdate(
    { sku },
    { $set: { low_stock_threshold: lowStockThreshold } },
    { new: true },
  );
};

const listInventory = async ({ page = 1, per_page = 50, search = "", filter = "all" }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);

  const match = {};
  if (filter === "low_stock") {
    match.$expr = {
      $and: [
        { $lte: ["$quantity_on_hand", "$low_stock_threshold"] },
        { $gt: ["$quantity_on_hand", 0] },
      ],
    };
  } else if (filter === "out_of_stock") {
    match.quantity_on_hand = 0;
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
  ];

  if (search && search.trim()) {
    pipeline.push({
      $match: {
        $or: [
          { sku: { $regex: search, $options: "i" } },
          { "product.name": { $regex: search, $options: "i" } },
        ],
      },
    });
  }

  pipeline.push({ $sort: { updatedAt: -1 } });

  const countPipeline = [...pipeline, { $count: "total" }];
  const dataPipeline = [
    ...pipeline,
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        sku: 1,
        variant_sku: 1,
        quantity_on_hand: 1,
        reserved_quantity: 1,
        low_stock_threshold: 1,
        last_restocked_at: 1,
        createdAt: 1,
        updatedAt: 1,
        "product._id": 1,
        "product.name": 1,
        "product.sku": 1,
        "product.banner_image": 1,
      },
    },
  ];

  const [data, countResult] = await Promise.all([
    Inventory.aggregate(dataPipeline),
    Inventory.aggregate(countPipeline),
  ]);

  return {
    data,
    total: countResult[0]?.total || 0,
  };
};

const createMovement = async (data) => {
  return await StockMovement.create(data);
};

const listMovements = async ({ sku, product, page = 1, per_page = 50 }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);
  const query = {};
  if (sku) query.sku = sku;
  if (product && mongoose.Types.ObjectId.isValid(product)) query.product = product;

  const [data, total] = await Promise.all([
    StockMovement.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StockMovement.countDocuments(query),
  ]);

  return { data, total };
};

const getRecentMovements = async (limit = 10) => {
  return await StockMovement.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("product", "name sku");
};

const getStatsAggregation = async () => {
  const result = await Inventory.aggregate([
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $group: {
        _id: null,
        total_skus_tracked: { $sum: 1 },
        total_units_in_stock: { $sum: "$quantity_on_hand" },
        total_stock_value: {
          $sum: {
            $multiply: [
              "$quantity_on_hand",
              { $toDouble: "$product.price" },
            ],
          },
        },
        low_stock_count: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $lte: ["$quantity_on_hand", "$low_stock_threshold"] },
                  { $gt: ["$quantity_on_hand", 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
        out_of_stock_count: {
          $sum: { $cond: [{ $eq: ["$quantity_on_hand", 0] }, 1, 0] },
        },
      },
    },
  ]);

  return (
    result[0] || {
      total_skus_tracked: 0,
      total_units_in_stock: 0,
      total_stock_value: 0,
      low_stock_count: 0,
      out_of_stock_count: 0,
    }
  );
};

module.exports = {
  findBySku,
  findByProductAndVariant,
  createInventory,
  updateQuantity,
  updateThreshold,
  listInventory,
  createMovement,
  listMovements,
  getRecentMovements,
  getStatsAggregation,
};
