const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const DeliveryZoneService = require("../../services/delivery_zone/index.js");
const mongoose = require("mongoose");

const getAllDeliveryZones = asyncHandler(async (req, res) => {
  const {
    page = 1,
    per_page = 50,
    search = "",
    sort = "latest",
    is_active,
  } = req.query;

  const zones = await DeliveryZoneService.getAllDeliveryZones({
    page,
    per_page,
    search,
    sort,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.json(
    new ApiResponse(200, zones, "Delivery zones fetched successfully", true)
  );
});

const getDeliveryZoneById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid delivery zone ID", false));
  }

  const zone = await DeliveryZoneService.getDeliveryZoneById(id);
  if (!zone) {
    return res.json(new ApiResponse(404, null, "Delivery zone not found", false));
  }

  res.json(
    new ApiResponse(200, zone, "Delivery zone fetched successfully", true)
  );
});

const createDeliveryZone = asyncHandler(async (req, res) => {
  let zoneData = { ...req.body };

  // Parse pincodes if it's a string
  if (typeof zoneData.pincodes === "string") {
    try {
      zoneData.pincodes = JSON.parse(zoneData.pincodes);
    } catch (error) {
      // Try splitting by comma
      zoneData.pincodes = zoneData.pincodes.split(",").map(pc => pc.trim());
    }
  }

  // Validate required fields
  if (!zoneData.zone_name) {
    return res.json(new ApiResponse(400, null, "Zone name is required", false));
  }

  if (!zoneData.pricing_type) {
    return res.json(new ApiResponse(400, null, "Pricing type is required", false));
  }

  // Validate pricing based on type
  if (zoneData.pricing_type === "flat_rate") {
    if (!zoneData.weight_unit_grams || zoneData.weight_unit_grams <= 0) {
      return res.json(
        new ApiResponse(400, null, "Valid weight unit in grams is required for flat_rate pricing", false)
      );
    }
    if (zoneData.price == null || zoneData.price < 0) {
      return res.json(
        new ApiResponse(400, null, "Valid price is required for flat_rate pricing", false)
      );
    }
  }

  if (zoneData.pricing_type === "flat_rate_plus_dynamic") {
    if (!zoneData.weight_unit_grams || zoneData.weight_unit_grams <= 0) {
      return res.json(
        new ApiResponse(400, null, "Valid weight unit in grams is required for flat_rate_plus_dynamic pricing", false)
      );
    }
    if (zoneData.price == null || zoneData.price < 0) {
      return res.json(
        new ApiResponse(400, null, "Valid price per unit is required for flat_rate_plus_dynamic pricing", false)
      );
    }
    if (zoneData.flat_rate_base == null || zoneData.flat_rate_base < 0) {
      return res.json(
        new ApiResponse(400, null, "Valid flat rate base is required for flat_rate_plus_dynamic pricing", false)
      );
    }
    if (!zoneData.min_weight_grams || zoneData.min_weight_grams <= 0) {
      return res.json(
        new ApiResponse(400, null, "Valid minimum weight in grams is required for flat_rate_plus_dynamic pricing", false)
      );
    }
  }

  if (zoneData.pricing_type === "fixed_rate" && (zoneData.fixed_amount == null || zoneData.fixed_amount < 0)) {
    return res.json(
      new ApiResponse(400, null, "Fixed amount is required for fixed_rate pricing", false)
    );
  }

  const result = await DeliveryZoneService.createDeliveryZone(zoneData);

  if (!result.success) {
    if (result.error === "duplicate_zone_name") {
      return res.json(
        new ApiResponse(
          409,
          null,
          result.message,
          false
        )
      );
    }
    
    if (result.error === "duplicate_pincodes") {
      return res.json(
        new ApiResponse(
          409,
          { duplicates: result.duplicates },
          "Some pincodes already exist in other zones",
          false
        )
      );
    }
  }

  res.json(
    new ApiResponse(201, result.zone, "Delivery zone created successfully", true)
  );
});

const updateDeliveryZone = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid delivery zone ID", false));
  }

  let zoneData = { ...req.body };

  // Parse pincodes if it's a string
  if (typeof zoneData.pincodes === "string") {
    try {
      zoneData.pincodes = JSON.parse(zoneData.pincodes);
    } catch (error) {
      // Try splitting by comma
      zoneData.pincodes = zoneData.pincodes.split(",").map(pc => pc.trim());
    }
  }

  const result = await DeliveryZoneService.updateDeliveryZone(id, zoneData);

  if (!result.success) {
    if (result.error === "duplicate_zone_name") {
      return res.json(
        new ApiResponse(
          409,
          null,
          result.message,
          false
        )
      );
    }
    
    if (result.error === "duplicate_pincodes") {
      return res.json(
        new ApiResponse(
          409,
          { duplicates: result.duplicates },
          "Some pincodes already exist in other zones",
          false
        )
      );
    }
  }

  if (!result.zone) {
    return res.json(new ApiResponse(404, null, "Delivery zone not found", false));
  }

  res.json(
    new ApiResponse(200, result.zone, "Delivery zone updated successfully", true)
  );
});

const deleteDeliveryZone = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid delivery zone ID", false));
  }

  const zone = await DeliveryZoneService.deleteDeliveryZone(id);
  if (!zone) {
    return res.json(new ApiResponse(404, null, "Delivery zone not found", false));
  }

  res.json(new ApiResponse(200, null, "Delivery zone deleted successfully", true));
});

const checkDuplicatePincodes = asyncHandler(async (req, res) => {
  let { pincodes, exclude_zone_id } = req.body;

  if (!pincodes || pincodes.length === 0) {
    return res.json(new ApiResponse(400, null, "Pincodes are required", false));
  }

  // Parse pincodes if it's a string
  if (typeof pincodes === "string") {
    try {
      pincodes = JSON.parse(pincodes);
    } catch (error) {
      // Try splitting by comma
      pincodes = pincodes.split(",").map(pc => pc.trim());
    }
  }

  const duplicates = await DeliveryZoneService.checkDuplicatePincodes(
    pincodes,
    exclude_zone_id
  );

  if (duplicates.length > 0) {
    return res.json(
      new ApiResponse(
        200,
        { has_duplicates: true, duplicates },
        "Duplicate pincodes found",
        true
      )
    );
  }

  res.json(
    new ApiResponse(
      200,
      { has_duplicates: false, duplicates: [] },
      "No duplicate pincodes found",
      true
    )
  );
});

const calculateDeliveryPrice = asyncHandler(async (req, res) => {
  const { pincode, weight_in_grams } = req.query;

  if (!pincode) {
    return res.json(new ApiResponse(400, null, "Pincode is required", false));
  }

  if (!weight_in_grams || weight_in_grams <= 0) {
    return res.json(new ApiResponse(400, null, "Valid weight in grams is required", false));
  }

  const result = await DeliveryZoneService.calculateDeliveryPrice(
    pincode,
    parseFloat(weight_in_grams)
  );

  if (!result.success) {
    return res.json(new ApiResponse(404, null, result.message, false));
  }

  res.json(
    new ApiResponse(200, result, "Delivery price calculated successfully", true)
  );
});

const setDefaultZone = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid delivery zone ID", false));
  }

  const zone = await DeliveryZoneService.setDefaultZone(id);

  if (!zone) {
    return res.json(new ApiResponse(404, null, "Delivery zone not found", false));
  }

  res.json(
    new ApiResponse(200, zone, "Default zone set successfully", true)
  );
});

module.exports = {
  getAllDeliveryZones,
  getDeliveryZoneById,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  checkDuplicatePincodes,
  calculateDeliveryPrice,
  setDefaultZone,
};

