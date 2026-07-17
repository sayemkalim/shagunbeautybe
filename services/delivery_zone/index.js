const DeliveryZoneRepository = require("../../repositories/delivery_zone/index.js");

const getAllDeliveryZones = async ({ page, per_page, search, sort, is_active }) => {
  const skip = (page - 1) * per_page;
  const limit = parseInt(per_page, 10);
  const sortOrder = sort === "latest" ? { createdAt: -1 } : { createdAt: 1 };

  const zones = await DeliveryZoneRepository.getAllDeliveryZones({
    search,
    sortOrder,
    skip,
    limit,
    is_active,
  });

  const total = await DeliveryZoneRepository.countAllDeliveryZones({
    search,
    is_active,
  });

  return {
    total,
    page: parseInt(page, 10),
    per_page: limit,
    total_pages: Math.ceil(total / per_page),
    zones,
  };
};

const getDeliveryZoneById = async (id) => {
  return await DeliveryZoneRepository.getDeliveryZoneById(id);
};

const createDeliveryZone = async (data) => {
  // Trim and normalize zone name
  if (data.zone_name) {
    data.zone_name = data.zone_name.trim();
  }

  // Check for duplicate zone name
  if (data.zone_name) {
    const existingZone = await DeliveryZoneRepository.checkDuplicateZoneName(data.zone_name);
    if (existingZone) {
      return {
        success: false,
        error: "duplicate_zone_name",
        message: `Zone name ${data.zone_name} already exists`,
        existing_zone: {
          id: existingZone._id,
          name: existingZone.zone_name,
        },
      };
    }
  }

  // Validate and normalize pincodes
  if (data.pincodes) {
    data.pincodes = data.pincodes.map(pc => pc.toString().trim());
  }

  // Check for duplicate pincodes
  const duplicates = await DeliveryZoneRepository.checkDuplicatePincodes(data.pincodes);
  
  if (duplicates.length > 0) {
    return {
      success: false,
      error: "duplicate_pincodes",
      duplicates,
    };
  }

  const zone = await DeliveryZoneRepository.createDeliveryZone(data);
  
  // If this is set as default, update other zones
  if (data.is_default) {
    await DeliveryZoneRepository.setDefaultZone(zone._id);
  }

  return {
    success: true,
    zone,
  };
};

const updateDeliveryZone = async (id, data) => {
  // Trim and normalize zone name
  if (data.zone_name) {
    data.zone_name = data.zone_name.trim();
  }

  // Check for duplicate zone name (excluding current zone)
  if (data.zone_name) {
    const existingZone = await DeliveryZoneRepository.checkDuplicateZoneName(data.zone_name, id);
    if (existingZone) {
      return {
        success: false,
        error: "duplicate_zone_name",
        message: `Zone name ${data.zone_name} already exists`,
        existing_zone: {
          id: existingZone._id,
          name: existingZone.zone_name,
        },
      };
    }
  }

  // Validate and normalize pincodes
  if (data.pincodes) {
    data.pincodes = data.pincodes.map(pc => pc.toString().trim());
    
    // Check for duplicate pincodes (excluding current zone)
    const duplicates = await DeliveryZoneRepository.checkDuplicatePincodes(
      data.pincodes,
      id
    );
    
    if (duplicates.length > 0) {
      return {
        success: false,
        error: "duplicate_pincodes",
        duplicates,
      };
    }
  }

  const updatedZone = await DeliveryZoneRepository.updateDeliveryZone(id, data);

  // If this is set as default, update other zones
  if (data.is_default) {
    await DeliveryZoneRepository.setDefaultZone(id);
  }

  return {
    success: true,
    zone: updatedZone,
  };
};

const deleteDeliveryZone = async (id) => {
  return await DeliveryZoneRepository.deleteDeliveryZone(id);
};

const checkDuplicatePincodes = async (pincodes, excludeZoneId = null) => {
  const normalizedPincodes = pincodes.map(pc => pc.toString().trim());
  return await DeliveryZoneRepository.checkDuplicatePincodes(
    normalizedPincodes,
    excludeZoneId
  );
};

const calculateDeliveryPrice = async (pincode, weightInGrams) => {
  // Normalize pincode
  const normalizedPincode = pincode.toString().trim();

  // Try to find zone by pincode
  let zone = await DeliveryZoneRepository.getDeliveryZoneByPincode(normalizedPincode);
  
  // If not found, get default fallback zone
  if (!zone) {
    zone = await DeliveryZoneRepository.getDefaultDeliveryZone();
    
    if (!zone) {
      return {
        success: false,
        message: "No delivery zone configured for this pincode and no default zone available",
      };
    }
  }

  // Calculate price based on pricing type
  let deliveryPrice = 0;
  let calculationDetails = null;

  switch (zone.pricing_type) {
    case "free":
      deliveryPrice = 0;
      break;

    case "fixed_rate":
      deliveryPrice = zone.fixed_amount;
      break;

    case "flat_rate":
      // Validate required fields
      if (!zone.weight_unit_grams || !zone.price) {
        return {
          success: false,
          message: "Weight unit and price are not configured for this zone",
        };
      }

      // Calculate multiplier based on weight
      const multiplier = Math.ceil(weightInGrams / zone.weight_unit_grams);
      deliveryPrice = zone.price * multiplier;
      
      calculationDetails = {
        weight_unit_grams: zone.weight_unit_grams,
        price: zone.price,
        multiplier: multiplier,
        calculation: `${weightInGrams}g requires ${multiplier} unit(s) of ${zone.weight_unit_grams}g @ ₹${zone.price} per unit`,
      };
      break;

    case "flat_rate_plus_dynamic":
      // Validate required fields
      if (!zone.weight_unit_grams || !zone.price || zone.flat_rate_base == null || !zone.min_weight_grams) {
        return {
          success: false,
          message: "Weight unit, price, flat rate base, and minimum weight are required for this zone",
        };
      }

      // Start with flat rate base
      deliveryPrice = zone.flat_rate_base;
      
      // If weight exceeds minimum, add dynamic pricing
      if (weightInGrams > zone.min_weight_grams) {
        const excessWeight = weightInGrams - zone.min_weight_grams;
        const dynamicMultiplier = Math.ceil(excessWeight / zone.weight_unit_grams);
        const dynamicCharge = zone.price * dynamicMultiplier;
        deliveryPrice += dynamicCharge;
        
        calculationDetails = {
          flat_rate_base: zone.flat_rate_base,
          min_weight_grams: zone.min_weight_grams,
          weight_unit_grams: zone.weight_unit_grams,
          price_per_unit: zone.price,
          excess_weight: excessWeight,
          dynamic_multiplier: dynamicMultiplier,
          dynamic_charge: dynamicCharge,
          calculation: `₹${zone.flat_rate_base} base + ${excessWeight}g excess (${dynamicMultiplier} unit(s) of ${zone.weight_unit_grams}g @ ₹${zone.price} per unit) = ₹${zone.flat_rate_base} + ₹${dynamicCharge}`,
        };
      } else {
        calculationDetails = {
          flat_rate_base: zone.flat_rate_base,
          min_weight_grams: zone.min_weight_grams,
          calculation: `${weightInGrams}g is below minimum weight ${zone.min_weight_grams}g, only base charge of ₹${zone.flat_rate_base} applies`,
        };
      }
      break;

    default:
      return {
        success: false,
        message: "Invalid pricing type",
      };
  }

  return {
    success: true,
    zone_name: zone.zone_name,
    zone_id: zone._id,
    pricing_type: zone.pricing_type,
    delivery_price: deliveryPrice,
    weight_in_grams: weightInGrams,
    calculation_details: calculationDetails,
    is_fallback: !await DeliveryZoneRepository.getDeliveryZoneByPincode(normalizedPincode),
  };
};

const setDefaultZone = async (zoneId) => {
  return await DeliveryZoneRepository.setDefaultZone(zoneId);
};

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

