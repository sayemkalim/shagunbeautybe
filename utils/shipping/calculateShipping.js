const DeliveryZone = require("../../models/deliveryZoneModel");

// Orders below this amount (pre-shipping) incur a flat shipping charge.
const FREE_SHIPPING_THRESHOLD = 2000;
const BELOW_THRESHOLD_SHIPPING_CHARGE = 50;

/**
 * Calculate shipping cost based on order amount: orders under ₹2000 incur a
 * flat ₹50 shipping charge, orders of ₹2000 or more ship free.
 * Returns a snapshot of shipping details to be stored with the order.
 * @param {Number} orderAmount - Order amount (pre-shipping) in rupees
 * @returns {Object} - { shippingCost, shippingDetails }
 */
function calculateShippingCost(orderAmount) {
  const amount = Number(orderAmount) || 0;
  const shippingCost =
    amount < FREE_SHIPPING_THRESHOLD ? BELOW_THRESHOLD_SHIPPING_CHARGE : 0;

  return {
    shippingCost,
    shippingDetails: {
      pricingType: "threshold",
      threshold: FREE_SHIPPING_THRESHOLD,
      isManual: false,
      calculatedAt: new Date(),
    },
  };
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

