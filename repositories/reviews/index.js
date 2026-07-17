const Review = require("../../models/reviewModel");

const getAllReviewsById = async (productId) => {
  return await Review.find({ productId });
};

const addNewReview = async (productId, data, userId) => {
  const newReview = new Review({
    ...data,
    productId,
    userId,
  });

  await newReview.save();
  return newReview;
};

module.exports = {
  getAllReviewsById,
  addNewReview,
};
