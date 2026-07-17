const express = require("express");
const router = express.Router();
const DashboardController = require("../../controllers/dashboard/index");
const {
  adminOrSuperAdmin,
} = require("../../middleware/auth/adminMiddleware");

// Dashboard Cards API
router.get("/overview", adminOrSuperAdmin, DashboardController.getDashboardCards);

// Sales Overview API (Bar Chart)
router.get("/sales-overview", adminOrSuperAdmin, DashboardController.getSalesOverview);

// Monthly Growth API (Line Chart)
router.get("/monthly-growth", adminOrSuperAdmin, DashboardController.getMonthlyGrowth);

// Category Distribution API (Pie Chart)
router.get("/category-distribution", adminOrSuperAdmin, DashboardController.getCategoryDistribution);

// Revenue Trend API (Line Chart)
router.get("/revenue-trend", adminOrSuperAdmin, DashboardController.getRevenueTrend);

module.exports = router; 