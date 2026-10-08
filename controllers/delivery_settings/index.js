const { asyncHandler } = require("../../common/asyncHandler");
const ApiResponse = require("../../utils/ApiResponse");
const DeliverySettingsService = require("../../services/delivery_settings/index.js");

const getDeliverySettings = asyncHandler(async (req, res) => {
  const settings = await DeliverySettingsService.getSettings();
  return res
    .status(200)
    .json(new ApiResponse(200, settings, "Delivery settings retrieved successfully", true));
});

const updateDeliverySettings = asyncHandler(async (req, res) => {
  const adminId = req.user ? req.user._id : null;
  const {
    is_delivery_fee_enabled,
    min_order_amount,
    max_order_amount,
    delivery_fee,
    free_delivery_above,
    description,
  } = req.body;

  const payload = {};
  if (is_delivery_fee_enabled !== undefined) payload.is_delivery_fee_enabled = Boolean(is_delivery_fee_enabled);
  if (min_order_amount !== undefined) payload.min_order_amount = Number(min_order_amount);
  if (max_order_amount !== undefined) payload.max_order_amount = Number(max_order_amount);
  if (delivery_fee !== undefined) payload.delivery_fee = Number(delivery_fee);
  if (free_delivery_above !== undefined) payload.free_delivery_above = Number(free_delivery_above);
  if (description !== undefined) payload.description = String(description);

  const updatedSettings = await DeliverySettingsService.updateSettings(payload, adminId);
  return res
    .status(200)
    .json(new ApiResponse(200, updatedSettings, "Delivery settings updated successfully", true));
});

const calculateDeliveryFee = asyncHandler(async (req, res) => {
  const { amount } = req.query;
  const result = await DeliverySettingsService.calculateDeliveryFee(Number(amount) || 0);

  return res
    .status(200)
    .json(new ApiResponse(200, result, result.reason, true));
});

module.exports = {
  getDeliverySettings,
  updateDeliverySettings,
  calculateDeliveryFee,
};
