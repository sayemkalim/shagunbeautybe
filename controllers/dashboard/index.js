const { asyncHandler } = require("../../common/asyncHandler");
const ApiResponse = require("../../utils/ApiResponse");
const DashboardService = require("../../services/dashboard/index");

const getDashboardCards = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.status(401).json(new ApiResponse(401, null, "Unauthorized", false));
  }

  const { startDate, endDate } = req.query;
  const result = await DashboardService.getDashboardCards(startDate, endDate);
  
  return res.status(200).json(
    new ApiResponse(200, result, "Dashboard cards data fetched successfully", true)
  );
});

const getSalesOverview = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.status(401).json(new ApiResponse(401, null, "Unauthorized", false));
  }

  const { startDate, endDate } = req.query;
  const result = await DashboardService.getSalesOverview(startDate, endDate);
  
  return res.status(200).json(
    new ApiResponse(200, result, "Sales overview data fetched successfully", true)
  );
});

const getMonthlyGrowth = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.status(401).json(new ApiResponse(401, null, "Unauthorized", false));
  }

  const { startDate, endDate } = req.query;
  const result = await DashboardService.getMonthlyGrowth(startDate, endDate);
  
  return res.status(200).json(
    new ApiResponse(200, result, "Monthly growth data fetched successfully", true)
  );
});

const getCategoryDistribution = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.status(401).json(new ApiResponse(401, null, "Unauthorized", false));
  }

  const { startDate, endDate } = req.query;
  const result = await DashboardService.getCategoryDistribution(startDate, endDate);
  
  return res.status(200).json(
    new ApiResponse(200, result, "Category distribution data fetched successfully", true)
  );
});

const getRevenueTrend = asyncHandler(async (req, res) => {
  const adminId = req.admin._id;
  if (!adminId) {
    return res.status(401).json(new ApiResponse(401, null, "Unauthorized", false));
  }

  const { startDate, endDate } = req.query;
  const result = await DashboardService.getRevenueTrend(startDate, endDate);
  
  return res.status(200).json(
    new ApiResponse(200, result, "Revenue trend data fetched successfully", true)
  );
});

module.exports = {
  getDashboardCards,
  getSalesOverview,
  getMonthlyGrowth,
  getCategoryDistribution,
  getRevenueTrend,
}; 