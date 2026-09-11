const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const MarqueeService = require("../../services/marquee/index.js");
const mongoose = require("mongoose");

const getAllMarquees = asyncHandler(async (req, res) => {
  const { page = 1, per_page = 50, is_active } = req.query;

  const result = await MarqueeService.getAllMarquees({
    page,
    per_page,
    is_active: is_active !== undefined ? is_active === "true" : undefined,
  });

  res.json(new ApiResponse(200, result, "Marquees fetched successfully", true));
});

// Public: storefront & mobile marquee ticker
const getActiveMarquees = asyncHandler(async (req, res) => {
  const marquees = await MarqueeService.getActiveMarquees();
  res.json(
    new ApiResponse(200, marquees, "Active marquees fetched successfully", true)
  );
});

const getMarqueeById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid marquee ID", false));
  }

  const marquee = await MarqueeService.getMarqueeById(id);
  if (!marquee) {
    return res.json(new ApiResponse(404, null, "Marquee not found", false));
  }

  res.json(new ApiResponse(200, marquee, "Marquee fetched successfully", true));
});

const createMarquee = asyncHandler(async (req, res) => {
  const { text, is_active, order } = req.body;

  if (!text || !text.trim()) {
    return res.json(
      new ApiResponse(400, null, "Marquee text is required", false)
    );
  }

  const data = {
    text: text.trim(),
    order: order !== undefined ? Number(order) : 0,
    is_active:
      is_active !== undefined
        ? is_active === true || is_active === "true"
        : true,
    created_by: req.admin ? req.admin._id : null,
  };

  const result = await MarqueeService.createMarquee(data);

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  res.json(
    new ApiResponse(201, result.marquee, "Marquee created successfully", true)
  );
});

const updateMarquee = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid marquee ID", false));
  }

  const { text, is_active, order } = req.body;
  const data = {};

  if (text !== undefined) {
    if (!text.trim()) {
      return res.json(
        new ApiResponse(400, null, "Marquee text cannot be empty", false)
      );
    }
    data.text = text.trim();
  }

  if (order !== undefined && !isNaN(Number(order))) {
    data.order = Number(order);
  }

  if (is_active !== undefined) {
    data.is_active = is_active === true || is_active === "true";
  }

  const result = await MarqueeService.updateMarquee(id, data);

  if (!result.success) {
    return res.json(new ApiResponse(400, null, result.message, false));
  }

  if (!result.marquee) {
    return res.json(new ApiResponse(404, null, "Marquee not found", false));
  }

  res.json(
    new ApiResponse(200, result.marquee, "Marquee updated successfully", true)
  );
});

const deleteMarquee = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid marquee ID", false));
  }

  const marquee = await MarqueeService.deleteMarquee(id);
  if (!marquee) {
    return res.json(new ApiResponse(404, null, "Marquee not found", false));
  }

  res.json(new ApiResponse(200, null, "Marquee deleted successfully", true));
});

module.exports = {
  getAllMarquees,
  getActiveMarquees,
  getMarqueeById,
  createMarquee,
  updateMarquee,
  deleteMarquee,
};
