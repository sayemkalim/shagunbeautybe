const DeliverySetting = require("../../models/deliverySettingModel");

const DEFAULT_DELIVERY_SETTINGS = {
  is_delivery_fee_enabled: true,
  min_order_amount: 1,
  max_order_amount: 2000,
  delivery_fee: 50,
  free_delivery_above: 2000,
};

class DeliverySettingsService {
  /**
   * Retrieves current delivery fee settings document.
   * If none exists in DB, creates default one.
   */
  static async getSettings() {
    let settings = await DeliverySetting.findOne();
    if (!settings) {
      settings = await DeliverySetting.create(DEFAULT_DELIVERY_SETTINGS);
    }
    return settings;
  }

  /**
   * Updates delivery fee settings.
   */
  static async updateSettings(data, adminId = null) {
    let settings = await DeliverySetting.findOne();

    const updatePayload = {
      ...data,
      updated_by: adminId,
    };

    if (!settings) {
      settings = await DeliverySetting.create({
        ...DEFAULT_DELIVERY_SETTINGS,
        ...updatePayload,
      });
    } else {
      Object.assign(settings, updatePayload);
      await settings.save();
    }

    return settings;
  }

  /**
   * Calculates delivery charge for a given order amount based on configured Min to Max range.
   * @param {number} orderAmount
   * @returns {{ delivery_fee: number, is_free: boolean, min_order_amount: number, max_order_amount: number, free_delivery_above: number }}
   */
  static async calculateDeliveryFee(orderAmount = 0) {
    const settings = await this.getSettings();
    const amount = Number(orderAmount) || 0;

    if (!settings.is_delivery_fee_enabled) {
      return {
        delivery_fee: 0,
        is_free: true,
        reason: "Delivery is currently free on all orders.",
        settings,
      };
    }

    const minAmount = settings.min_order_amount ?? 1;
    const maxAmount = settings.max_order_amount ?? 2000;
    const freeAbove = settings.free_delivery_above ?? 2000;
    const fee = settings.delivery_fee ?? 50;

    // Free delivery check (orders above threshold)
    if (freeAbove > 0 && amount >= freeAbove) {
      return {
        delivery_fee: 0,
        is_free: true,
        reason: `Free Delivery applied on orders above ₹${freeAbove}!`,
        settings,
      };
    }

    // Orders in custom range [min, max]
    if (amount >= minAmount && amount <= maxAmount) {
      return {
        delivery_fee: fee,
        is_free: false,
        reason: `Delivery fee of ₹${fee} applied for orders between ₹${minAmount} and ₹${maxAmount}.`,
        settings,
      };
    }

    // Fallback for orders below minAmount
    if (amount < minAmount) {
      return {
        delivery_fee: fee,
        is_free: false,
        reason: `Delivery fee of ₹${fee} applied.`,
        settings,
      };
    }

    return {
      delivery_fee: 0,
      is_free: true,
      reason: "Free Delivery applied.",
      settings,
    };
  }
}

module.exports = DeliverySettingsService;
