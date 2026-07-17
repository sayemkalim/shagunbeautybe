const DeliveryZone = require("../../models/deliveryZoneModel");

const getAllDeliveryZones = async ({ search, sortOrder, skip, limit, is_active }) => {
  let filter = {};
  if (search) {
    filter.$or = [
      { zone_name: { $regex: search, $options: "i" } },
      { pincodes: { $regex: search, $options: "i" } },
    ];
  }
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await DeliveryZone.find(filter).sort(sortOrder).skip(skip).limit(limit);
};

const countAllDeliveryZones = async ({ search, is_active }) => {
  let filter = {};
  if (search) {
    filter.$or = [
      { zone_name: { $regex: search, $options: "i" } },
      { pincodes: { $regex: search, $options: "i" } },
    ];
  }
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await DeliveryZone.countDocuments(filter);
};

const getDeliveryZoneById = async (id) => {
  return await DeliveryZone.findById(id);
};

const createDeliveryZone = async (data) => {
  return await DeliveryZone.create(data);
};

const updateDeliveryZone = async (id, data) => {
  return await DeliveryZone.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const deleteDeliveryZone = async (id) => {
  return await DeliveryZone.findByIdAndDelete(id);
};

// Check if zone name already exists
const checkDuplicateZoneName = async (zoneName, excludeZoneId = null) => {
  // Trim the zone name before checking
  const trimmedZoneName = zoneName.trim();
  
  const filter = {
    zone_name: { $regex: new RegExp(`^${trimmedZoneName}$`, 'i') }, // Case-insensitive exact match
  };
  
  if (excludeZoneId) {
    filter._id = { $ne: excludeZoneId };
  }

  const existingZone = await DeliveryZone.findOne(filter).select("zone_name _id");
  
  return existingZone;
};

// Check if pincodes already exist in other zones
const checkDuplicatePincodes = async (pincodes, excludeZoneId = null) => {
  const filter = {
    pincodes: { $in: pincodes },
  };
  
  if (excludeZoneId) {
    filter._id = { $ne: excludeZoneId };
  }

  const existingZones = await DeliveryZone.find(filter).select("zone_name pincodes");
  
  if (existingZones.length > 0) {
    const duplicates = [];
    existingZones.forEach(zone => {
      const commonPincodes = zone.pincodes.filter(pc => pincodes.includes(pc));
      if (commonPincodes.length > 0) {
        commonPincodes.forEach(pc => {
          duplicates.push({
            pincode: pc,
            existing_zone: zone.zone_name,
            zone_id: zone._id,
          });
        });
      }
    });
    return duplicates;
  }
  
  return [];
};

// Find delivery zone by pincode
const getDeliveryZoneByPincode = async (pincode) => {
  return await DeliveryZone.findOne({
    pincodes: pincode,
    is_active: true,
  });
};

// Get default fallback zone
const getDefaultDeliveryZone = async () => {
  return await DeliveryZone.findOne({
    is_default: true,
    is_active: true,
  });
};

// Set a zone as default (ensures only one default zone)
const setDefaultZone = async (zoneId) => {
  // First, unset all other default zones
  await DeliveryZone.updateMany(
    { _id: { $ne: zoneId } },
    { $set: { is_default: false } }
  );
  
  // Then set the specified zone as default
  return await DeliveryZone.findByIdAndUpdate(
    zoneId,
    { $set: { is_default: true } },
    { new: true }
  );
};

module.exports = {
  getAllDeliveryZones,
  getDeliveryZoneById,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  countAllDeliveryZones,
  checkDuplicateZoneName,
  checkDuplicatePincodes,
  getDeliveryZoneByPincode,
  getDefaultDeliveryZone,
  setDefaultZone,
};

