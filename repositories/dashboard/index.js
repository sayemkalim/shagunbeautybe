const Order = require("../../models/orderModel");
const Product = require("../../models/productsModel");
const Category = require("../../models/categoryModel");
const SubCategory = require("../../models/subCategoryModel");

const getDashboardCards = async (startDate, endDate) => {
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // Get current period data
  const [currentOrders, currentUsers] = await Promise.all([
    Order.find(dateFilter),
    Order.find(dateFilter).distinct('user')
  ]);

  // Calculate previous period for comparison
  const currentStart = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const currentEnd = endDate ? new Date(endDate) : new Date();
  
  const daysDiff = Math.ceil((currentEnd - currentStart) / (1000 * 60 * 60 * 24));
  const previousStart = new Date(currentStart.getTime() - (daysDiff * 24 * 60 * 60 * 1000));
  const previousEnd = new Date(currentStart.getTime() - 1);

  // Previous period data
  const [previousOrders, previousUsers] = await Promise.all([
    Order.find({
      createdAt: {
        $gte: previousStart,
        $lte: previousEnd
      }
    }),
    Order.find({
      createdAt: {
        $gte: previousStart,
        $lte: previousEnd
      }
    }).distinct('user')
  ]);

  // Calculate total sales
  const currentTotalSales = currentOrders.reduce((sum, order) => {
    return sum + (order.discountedTotalAmount ? parseFloat(order.discountedTotalAmount.toString()) : 0);
  }, 0);

  const previousTotalSales = previousOrders.reduce((sum, order) => {
    return sum + (order.discountedTotalAmount ? parseFloat(order.discountedTotalAmount.toString()) : 0);
  }, 0);

  // Calculate growth percentages
  const salesGrowth = previousTotalSales > 0 ? 
    ((currentTotalSales - previousTotalSales) / previousTotalSales * 100) : 0;
  
  const usersGrowth = previousUsers.length > 0 ? 
    ((currentUsers.length - previousUsers.length) / previousUsers.length * 100) : 0;
  
  const ordersGrowth = previousOrders.length > 0 ? 
    ((currentOrders.length - previousOrders.length) / previousOrders.length * 100) : 0;

  return {
    totalSales: {
      value: Math.round(currentTotalSales),
      growth: Math.round(salesGrowth * 100) / 100,
      isPositive: salesGrowth >= 0
    },
    newUsers: {
      value: currentUsers.length,
      growth: Math.round(usersGrowth * 100) / 100,
      isPositive: usersGrowth >= 0
    },
    orders: {
      value: currentOrders.length,
      growth: Math.round(ordersGrowth * 100) / 100,
      isPositive: ordersGrowth >= 0
    }
  };
};

const getSalesOverview = async (startDate, endDate) => {
  // Set default dates to current year if not provided
  const currentYear = new Date().getFullYear();
  const defaultStartDate = `${currentYear}-01-01`;
  const defaultEndDate = `${currentYear}-12-31`;
  
  const start = startDate || defaultStartDate;
  const end = endDate || defaultEndDate;
  
  const dateFilter = {
    createdAt: {
      $gte: new Date(start),
      $lte: new Date(end)
    }
  };

  // Get sales data grouped by month
  const salesData = await Order.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        totalSales: {
          $sum: {
            $toDouble: "$discountedTotalAmount"
          }
        },
        orderCount: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 }
    }
  ]);

  // Format data for chart
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return salesData.map(item => ({
    month: monthNames[item._id.month - 1],
    sales: Math.round(item.totalSales),
    orders: item.orderCount
  }));
};

const getMonthlyGrowth = async (startDate, endDate) => {
  // Set default dates to current year if not provided
  const currentYear = new Date().getFullYear();
  const defaultStartDate = `${currentYear}-01-01`;
  const defaultEndDate = `${currentYear}-12-31`;
  
  const start = startDate || defaultStartDate;
  const end = endDate || defaultEndDate;
  
  const dateFilter = {
    createdAt: {
      $gte: new Date(start),
      $lte: new Date(end)
    }
  };

  // Get growth data by month
  const growthData = await Order.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        totalRevenue: {
          $sum: {
            $toDouble: "$discountedTotalAmount"
          }
        },
        orderCount: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 }
    }
  ]);

  // Calculate growth percentage for each month
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const result = [];
  
  for (let i = 0; i < growthData.length; i++) {
    const currentMonth = growthData[i];
    const previousMonth = i > 0 ? growthData[i - 1] : null;
    
    let growth = 0;
    if (previousMonth && previousMonth.totalRevenue > 0) {
      growth = ((currentMonth.totalRevenue - previousMonth.totalRevenue) / previousMonth.totalRevenue) * 100;
    } else if (currentMonth.totalRevenue > 0) {
      // If this is the first month with data, growth is 100%
      growth = 100;
    }
    
    result.push({
      month: monthNames[currentMonth._id.month - 1],
      growth: Math.round(growth * 100) / 100,
      revenue: Math.round(currentMonth.totalRevenue),
      orders: currentMonth.orderCount
    });
  }
  
  return result;
};

const getCategoryDistribution = async (startDate, endDate) => {
  // Build date filter
  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // Get category distribution from orders
  const categoryData = await Order.aggregate([
    { $match: dateFilter },
    { $unwind: "$items" },
    { $match: { "items.type": "product" } },
    {
      $lookup: {
        from: "products",
        localField: "items.product._id",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    { $unwind: "$productDetails" },
    {
      $lookup: {
        from: "subcategories",
        localField: "productDetails.sub_category",
        foreignField: "_id",
        as: "subCategoryDetails"
      }
    },
    { $unwind: "$subCategoryDetails" },
    {
      $lookup: {
        from: "categories",
        localField: "subCategoryDetails.category",
        foreignField: "_id",
        as: "categoryDetails"
      }
    },
    { $unwind: "$categoryDetails" },
    {
      $group: {
        _id: "$categoryDetails._id",
        categoryName: { $first: "$categoryDetails.name" },
        totalRevenue: {
          $sum: {
            $toDouble: "$items.discounted_total_amount"
          }
        },
        totalOrders: { $sum: 1 },
        totalQuantity: { $sum: "$items.quantity" }
      }
    },
    {
      $sort: { totalRevenue: -1 }
    }
  ]);

  // Calculate total revenue for percentage calculation
  const totalRevenue = categoryData.reduce((sum, cat) => sum + cat.totalRevenue, 0);

  return categoryData.map(category => ({
    categoryName: category.categoryName,
    revenue: Math.round(category.totalRevenue),
    orders: category.totalOrders,
    quantity: category.totalQuantity,
    percentage: totalRevenue > 0 ? Math.round((category.totalRevenue / totalRevenue) * 100 * 100) / 100 : 0
  }));
};

const getRevenueTrend = async (startDate, endDate) => {
  // Set default dates to current year if not provided
  const currentYear = new Date().getFullYear();
  const defaultStartDate = `${currentYear}-01-01`;
  const defaultEndDate = `${currentYear}-12-31`;
  
  const start = startDate || defaultStartDate;
  const end = endDate || defaultEndDate;
  
  const dateFilter = {
    createdAt: {
      $gte: new Date(start),
      $lte: new Date(end)
    }
  };

  // Get revenue trend by month
  const revenueData = await Order.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        totalRevenue: {
          $sum: {
            $toDouble: "$discountedTotalAmount"
          }
        },
        orderCount: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 }
    }
  ]);

  // Format data for line chart
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return revenueData.map(item => ({
    month: monthNames[item._id.month - 1],
    revenue: Math.round(item.totalRevenue),
    orders: item.orderCount
  }));
};

module.exports = {
  getDashboardCards,
  getSalesOverview,
  getMonthlyGrowth,
  getCategoryDistribution,
  getRevenueTrend,
}; 