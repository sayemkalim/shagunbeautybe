exports.asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    const rawStatus = error.statusCode || error.code || 500;
    const statusCode =
      typeof rawStatus === "number" && rawStatus >= 100 && rawStatus < 600
        ? rawStatus
        : 500;
    const responseBody = {
      success: false,
      message: error.message || "Internal server error",
    };
    if (error.outOfStockItems && Array.isArray(error.outOfStockItems)) {
      responseBody.outOfStockItems = error.outOfStockItems;
    }
    res.status(statusCode).json(responseBody);
  }
};