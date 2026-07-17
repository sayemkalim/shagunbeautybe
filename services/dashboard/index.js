const DashboardRepository = require("../../repositories/dashboard/index");

const getDashboardCards = async (startDate, endDate) => {
  return await DashboardRepository.getDashboardCards(startDate, endDate);
};

const getSalesOverview = async (startDate, endDate) => {
  return await DashboardRepository.getSalesOverview(startDate, endDate);
};

const getMonthlyGrowth = async (startDate, endDate) => {
  return await DashboardRepository.getMonthlyGrowth(startDate, endDate);
};

const getCategoryDistribution = async (startDate, endDate) => {
  return await DashboardRepository.getCategoryDistribution(startDate, endDate);
};

const getRevenueTrend = async (startDate, endDate) => {
  return await DashboardRepository.getRevenueTrend(startDate, endDate);
};

module.exports = {
  getDashboardCards,
  getSalesOverview,
  getMonthlyGrowth,
  getCategoryDistribution,
  getRevenueTrend,
}; 