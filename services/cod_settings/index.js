const CodSetting = require("../../models/codSettingModel");

const DEFAULT_SETTINGS = {
  is_cod_enabled: true,
  min_order_amount: 1,
  max_order_amount: 2000,
  allowed_pincodes: ["206001"],
  allow_all_pincodes: false,
  cod_extra_charge: 0,
};

class CodSettingsService {
  /**
   * Retrieves the current COD settings document.
   * If none exists in DB, creates a default one.
   */
  static async getSettings() {
    let settings = await CodSetting.findOne();
    if (!settings) {
      settings = await CodSetting.create(DEFAULT_SETTINGS);
    }
    return settings;
  }

  /**
   * Updates COD settings.
   */
  static async updateSettings(data, adminId = null) {
    let settings = await CodSetting.findOne();

    const updatePayload = {
      ...data,
      updated_by: adminId,
    };

    // Clean allowed_pincodes if passed
    if (Array.isArray(updatePayload.allowed_pincodes)) {
      updatePayload.allowed_pincodes = updatePayload.allowed_pincodes
        .map((p) => String(p).trim())
        .filter((p) => p.length > 0);
      // Remove duplicates
      updatePayload.allowed_pincodes = [...new Set(updatePayload.allowed_pincodes)];
    }

    if (!settings) {
      settings = await CodSetting.create({
        ...DEFAULT_SETTINGS,
        ...updatePayload,
      });
    } else {
      Object.assign(settings, updatePayload);
      await settings.save();
    }

    return settings;
  }

  /**
   * Checks if COD is eligible for a given pincode and order amount.
   * @param {Object} params
   * @param {string|number} params.pincode
   * @param {number} params.amount
   */
  static async checkEligibility({ pincode, amount }) {
    const settings = await this.getSettings();
    const orderAmount = Number(amount) || 0;
    const cleanPincode = String(pincode || "").trim();

    if (!settings.is_cod_enabled) {
      return {
        eligible: false,
        reason: "Cash on Delivery is currently disabled.",
        settings,
      };
    }

    const minAmount = settings.min_order_amount ?? 1;
    const maxAmount = settings.max_order_amount ?? 2000;

    if (orderAmount < minAmount) {
      return {
        eligible: false,
        reason: `COD is only applicable on orders of ₹${minAmount} and above.`,
        settings,
      };
    }

    if (maxAmount > 0 && orderAmount > maxAmount) {
      return {
        eligible: false,
        reason: `COD is only applicable for orders up to ₹${maxAmount}. For higher amounts, please choose online payment.`,
        settings,
      };
    }

    if (!settings.allow_all_pincodes) {
      const isPincodeAllowed = settings.allowed_pincodes.some(
        (p) => String(p).trim() === cleanPincode
      );

      if (!isPincodeAllowed) {
        return {
          eligible: false,
          reason: `Cash on Delivery is not available for pincode ${cleanPincode}. Available in selected areas (e.g. 206001).`,
          settings,
        };
      }
    }

    return {
      eligible: true,
      reason: "COD is available for this order.",
      settings,
    };
  }
}

module.exports = CodSettingsService;
