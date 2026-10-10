const DeliveryZone = require("../../models/deliveryZoneModel");
const DeliverySettingsService = require("../../services/delivery_settings/index.js");

// Fallback constants
const FREE_SHIPPING_THRESHOLD = 2000;
const BELOW_THRESHOLD_SHIPPING_CHARGE = 50;

/**
 * Calculate shipping cost based on specific delivery zone ID
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
          ) || 1;
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
          ) || 1;
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

/**
 * Calculate dynamic shipping cost based on global DeliverySettings configured in admin.
 * Delivery zones (DeliveryZone) do NOT override or affect the delivery fee.
 *
 * @param {Number} orderAmount - Order amount in rupees
 * @param {String} [pincode] - Delivery address pincode (kept for signature compatibility)
 * @param {Number} [totalWeightGrams=0] - Total order weight in grams (kept for signature compatibility)
 * @returns {Promise<Object>} - { shippingCost, shippingDetails }
 */
async function calculateShippingCost(orderAmount, pincode = null, totalWeightGrams = 0) {
  const amount = Number(orderAmount) || 0;

  try {
    // Apply Global Delivery Settings (e.g. Free delivery above threshold, otherwise configured delivery fee)
    const deliveryRule = await DeliverySettingsService.calculateDeliveryFee(amount);
    if (deliveryRule && deliveryRule.delivery_fee !== undefined) {
      const fee = Math.max(0, Number(deliveryRule.delivery_fee) || 0);
      return {
        shippingCost: fee,
        shippingDetails: {
          pricingType: "amount_range",
          min_order_amount: deliveryRule.settings?.min_order_amount,
          max_order_amount: deliveryRule.settings?.max_order_amount,
          free_delivery_above: deliveryRule.settings?.free_delivery_above,
          delivery_fee: fee,
          is_free: !!deliveryRule.is_free,
          reason: deliveryRule.reason,
          isManual: false,
          calculatedAt: new Date(),
        },
      };
    }
  } catch (err) {
    console.warn("Dynamic delivery calculation warning:", err.message);
  }

  // Fallback standard threshold
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

module.exports = { calculateShippingCost, calculateShippingByZone };
