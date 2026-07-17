const mongoose = require("mongoose");
const Cart = require("../../models/cartModel");

const getCart = async () => {
  return await Cart.find({});
};

const getCartByUserId = async ({ user_id }) => {
  if (user_id) {
    return await Cart.findOne({ user: user_id })
      .populate("items.product")
      .populate({
        path: "items.bundle",
        populate: {
          path: "products.product",
          model: "Product"
        }
      });
  }

  return await Cart.find()
    .populate("items.product")
    .populate({
      path: "items.bundle",
      populate: {
        path: "products.product",
        model: "Product"
      }
    });
};

const addToCart = async (data) => {
  const result = await Cart.create(data);
  return result;
};

const updateCartItem = async (id, data) => {
  return await Cart.findByIdAndUpdate(id, data, { new: true });
};

const deleteCartByUserId = async (id) => {
  return await Cart.deleteOne({ user: id });
};

module.exports = {
  getCart,
  getCartByUserId,
  addToCart,
  updateCartItem,
  deleteCartByUserId,
};
