const mongoose = require("mongoose");
const ApiResponse = require("../../utils/ApiResponse.js");
const ReviewRepositories = require("../../repositories/reviews/index.js");
const { asyncHandler } = require("../../common/asyncHandler.js");
const orderModel = require("../../models/orderModel.js");
const Product = require("../../models/productsModel.js");

const getAllReviews = asyncHandler(async (req, res) => {
  const { productId } = req.query;

  if (!productId) {
    return res.json(new ApiResponse(404, null, "No productId found", false));
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.json(new ApiResponse(400, null, "Invalid productId", false));
  }

  // Check if product exists
  const productExists = await Product.exists({ _id: productId });
  if (!productExists) {
    return res.json(new ApiResponse(404, null, "Product not found", false));
  }

  const reviews = await ReviewRepositories.getAllReviewsById(productId);

  if (reviews.length === 0) {
    return res.json(new ApiResponse(404, null, "No review found", false));
  }
  return res.json(
    new ApiResponse(200, reviews, "Reviews fetched successfully", true)
  );
});

const postReviews = asyncHandler(async (req, res) => {
  try {
    const { productId } = req.query;
    const data = req.body;
    const user = req.user;

    if (!productId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Product ID is required", false));
    }
    if (!user?._id) {
      return res
        .status(401)
        .json(
          new ApiResponse(401, null, "Unauthorized: User not found", false)
        );
    }
    if (!data || !Object.keys(data).length) {
      return res
        .status(400)
        .json(
          new ApiResponse(400, null, "Please fill all required fields", false)
        );
    }

    const isOrdered = await orderModel.findOne({
      user: user._id,
      "items.product._id": productId,
    });

    if (!isOrdered) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            "You must purchase the product to review it",
            false
          )
        );
    }

    const review = await ReviewRepositories.addNewReview(
      productId,
      data,
      user._id
    );
    
    if (!review) {
      return res
        .status(500)
        .json(new ApiResponse(500, null, "Failed to add review", false));
    }

    return res
      .status(201)
      .json(new ApiResponse(201, review, "Review added successfully", true));
  } catch (error) {
    console.error("Error in postReviews:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, null, "Internal Server Error", false));
  }
});

module.exports = {
  getAllReviews,
  postReviews,
};
