const mongoose = require("mongoose");
const Cart = require("../../models/cartModel");

const CART_PRODUCT_FIELDS =
  "name sku price discounted_price images banner_image variants price_tiers is_out_of_stock inventory base_available_inventory available_inventory status weight_in_grams color color_name";

const CART_BUNDLE_PRODUCT_FIELDS =
  "name sku price discounted_price images variants is_out_of_stock inventory status";

const getCart = async () => {
  return await Cart.find({});
};

const populateCart = async (cart) => {
  if (!cart) return cart;
  return await cart.populate([
    {
      path: "items.product",
      select: CART_PRODUCT_FIELDS,
    },
    {
      path: "items.bundle",
      populate: {
        path: "products.product",
        model: "Product",
        select: CART_BUNDLE_PRODUCT_FIELDS,
      },
    },
  ]);
};

const getRawCartByUserId = async ({ user_id }) => {
  if (!user_id) return null;
  return await Cart.findOne({ user: user_id });
};

const getCartByUserId = async ({ user_id }) => {
  if (user_id) {
    return await Cart.findOne({ user: user_id })
      .populate({
        path: "items.product",
        select: CART_PRODUCT_FIELDS,
      })
      .populate({
        path: "items.bundle",
        populate: {
          path: "products.product",
          model: "Product",
          select: CART_BUNDLE_PRODUCT_FIELDS,
        },
      });
  }

  return await Cart.find()
    .populate({
      path: "items.product",
      select: CART_PRODUCT_FIELDS,
    })
    .populate({
      path: "items.bundle",
      populate: {
        path: "products.product",
        model: "Product",
        select: CART_BUNDLE_PRODUCT_FIELDS,
      },
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
  getRawCartByUserId,
  populateCart,
  addToCart,
  updateCartItem,
  deleteCartByUserId,
};
