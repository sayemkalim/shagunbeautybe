const { asyncHandler } = require("../../common/asyncHandler");
const ApiResponse = require("../../utils/ApiResponse");
const CodSettingsService = require("../../services/cod_settings/index.js");

const getCodSettings = asyncHandler(async (req, res) => {
  const settings = await CodSettingsService.getSettings();
  return res
    .status(200)
    .json(new ApiResponse(200, settings, "COD settings retrieved successfully", true));
});

const updateCodSettings = asyncHandler(async (req, res) => {
  const adminId = req.user ? req.user._id : null;
  const {
    is_cod_enabled,
    min_order_amount,
    max_order_amount,
    allowed_pincodes,
    allow_all_pincodes,
    cod_extra_charge,
    description,
  } = req.body;

  const payload = {};
  if (is_cod_enabled !== undefined) payload.is_cod_enabled = Boolean(is_cod_enabled);
  if (min_order_amount !== undefined) payload.min_order_amount = Number(min_order_amount);
  if (max_order_amount !== undefined) payload.max_order_amount = Number(max_order_amount);
  if (allowed_pincodes !== undefined) payload.allowed_pincodes = allowed_pincodes;
  if (allow_all_pincodes !== undefined) payload.allow_all_pincodes = Boolean(allow_all_pincodes);
  if (cod_extra_charge !== undefined) payload.cod_extra_charge = Number(cod_extra_charge);
  if (description !== undefined) payload.description = String(description);

  const updatedSettings = await CodSettingsService.updateSettings(payload, adminId);
  return res
    .status(200)
    .json(new ApiResponse(200, updatedSettings, "COD settings updated successfully", true));
});

const checkCodEligibility = asyncHandler(async (req, res) => {
  const { pincode, amount } = req.query;
  const result = await CodSettingsService.checkEligibility({
    pincode,
    amount,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, result.reason, result.eligible));
});

module.exports = {
  getCodSettings,
  updateCodSettings,
  checkCodEligibility,
};
