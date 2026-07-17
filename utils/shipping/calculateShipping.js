const DeliveryZone = require("../../models/deliveryZoneModel");

/**
 * Calculate shipping cost based on delivery zone and order weight
 * Returns a snapshot of shipping details to be stored with the order
 * @param {String} pincode - Delivery pincode
 * @param {Number} totalWeightGrams - Total order weight in grams
 * @returns {Object} - { shippingCost, shippingDetails }
 */
async function calculateShippingCost(pincode, totalWeightGrams = 0) {
  try {
    // Find delivery zone by pincode
    let deliveryZone = await DeliveryZone.findOne({
      pincodes: pincode,
      is_active: true,
    });

    // If no zone found for pincode, use default zone
    if (!deliveryZone) {
      deliveryZone = await DeliveryZone.findOne({
        is_default: true,
        is_active: true,
      });
    }

    // If still no zone found, return 0 shipping cost
    if (!deliveryZone) {
      return {
        shippingCost: 0,
        shippingDetails: null,
      };
    }

    let shippingCost = 0;

    switch (deliveryZone.pricing_type) {
      case "free":
        shippingCost = 0;
        break;

      case "fixed_rate":
        shippingCost = deliveryZone.fixed_amount || 0;
        break;

      case "flat_rate":
        // Calculate based on weight units
        if (
          deliveryZone.weight_unit_grams &&
          deliveryZone.price !== undefined
        ) {
          const weightUnits = Math.ceil(
            totalWeightGrams / deliveryZone.weight_unit_grams
          );
          shippingCost = weightUnits * deliveryZone.price;
        }
        break;

      case "flat_rate_plus_dynamic":
        // Base flat rate + dynamic pricing based on weight
        shippingCost = deliveryZone.flat_rate_base || 0;

        if (totalWeightGrams > deliveryZone.min_weight_grams) {
          const excessWeight =
            totalWeightGrams - deliveryZone.min_weight_grams;
          const excessWeightUnits = Math.ceil(
            excessWeight / deliveryZone.weight_unit_grams
          );
          shippingCost += excessWeightUnits * deliveryZone.price;
        }
        break;

      default:
        shippingCost = 0;
    }

    // Return shipping cost as a fixed value with snapshot of delivery zone details
    // This ensures the shipping cost remains the same even if delivery zone pricing changes later
    return {
      shippingCost: Math.max(0, shippingCost), // Ensure non-negative
      shippingDetails: {
        deliveryZoneId: deliveryZone._id,
        zoneName: deliveryZone.zone_name,
        pricingType: deliveryZone.pricing_type,
        isManual: false,
        calculatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error("Error calculating shipping cost:", error);
    return {
      shippingCost: 0,
      shippingDetails: null,
    };
  }
}

/**
 * Calculate shipping cost based on a specific delivery zone ID
 * @param {String} deliveryZoneId - Delivery zone ID
 * @param {Number} totalWeightGrams - Total order weight in grams
 * @returns {Object} - { shippingCost, shippingDetails }
 */
async function calculateShippingByZone(deliveryZoneId, totalWeightGrams = 0) {
  try {
    const deliveryZone = await DeliveryZone.findOne({
      _id: deliveryZoneId,
      is_active: true,
    });

    if (!deliveryZone) {
      return {
        shippingCost: 0,
        shippingDetails: null,
      };
    }

    let shippingCost = 0;

    switch (deliveryZone.pricing_type) {
      case "free":
        shippingCost = 0;
        break;

      case "fixed_rate":
        shippingCost = deliveryZone.fixed_amount || 0;
        break;

      case "flat_rate":
        if (
          deliveryZone.weight_unit_grams &&
          deliveryZone.price !== undefined
        ) {
          const weightUnits = Math.ceil(
            totalWeightGrams / deliveryZone.weight_unit_grams
          );
          shippingCost = weightUnits * deliveryZone.price;
        }
        break;

      case "flat_rate_plus_dynamic":
        shippingCost = deliveryZone.flat_rate_base || 0;

        if (totalWeightGrams > deliveryZone.min_weight_grams) {
          const excessWeight =
            totalWeightGrams - deliveryZone.min_weight_grams;
          const excessWeightUnits = Math.ceil(
            excessWeight / deliveryZone.weight_unit_grams
          );
          shippingCost += excessWeightUnits * deliveryZone.price;
        }
        break;

      default:
        shippingCost = 0;
    }

    return {
      shippingCost: Math.max(0, shippingCost),
      shippingDetails: {
        deliveryZoneId: deliveryZone._id,
        zoneName: deliveryZone.zone_name,
        pricingType: deliveryZone.pricing_type,
        isManual: false,
        calculatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error("Error calculating shipping by zone:", error);
    return {
      shippingCost: 0,
      shippingDetails: null,
    };
  }
}

module.exports = { calculateShippingCost, calculateShippingByZone };

