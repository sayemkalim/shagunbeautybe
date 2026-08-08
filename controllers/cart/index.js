const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const CartService = require("../../services/cart/index.js");
const CouponService = require("../../services/coupon/index.js");
const { calculateShippingCost } = require("../../utils/shipping/calculateShipping.js");

const getCart = asyncHandler(async (req, res) => {
  const user_id = req.user?._id;
  const { couponCode: coupon_code } = req.query;

  const cart = await CartService.getCart({ user_id });

  const cartTotalPrice = cart?.total_price || 0;

  // Orders under ₹2000 incur a flat ₹50 shipping charge
  let shippingCharge = 0;
  if (cart && cart.items && cart.items.length > 0) {
    const { shippingCost } = await calculateShippingCost(cartTotalPrice);
    shippingCharge = shippingCost;
  }

  // Validate coupon (if provided) against the cart's item total, before shipping
  let couponInfo = null;
  let couponDiscountAmount = 0;
  if (coupon_code && user_id && cart && cart.items && cart.items.length > 0) {
    const couponResult = await CouponService.validateCoupon({
      code: coupon_code,
      userId: user_id,
      orderTotal: cartTotalPrice,
    });

    if (couponResult.success) {
      couponDiscountAmount = couponResult.discount_amount;
      couponInfo = {
        code: couponResult.coupon.code,
        is_valid: true,
        discount_type: couponResult.coupon.discount_type,
        discount_value: couponResult.coupon.discount_value,
        discount_amount: couponDiscountAmount,
        message: "Coupon applied successfully",
      };
    } else {
      couponInfo = {
        code: coupon_code,
        is_valid: false,
        discount_amount: 0,
        message: couponResult.message,
      };
    }
  }

  const finalPrice = cartTotalPrice - couponDiscountAmount + shippingCharge;

  // Add shipping and final price to cart object
  const cartWithPricing = {
    ...(cart ? cart.toObject() : {}),
    shipping_charge: shippingCharge,
    coupon: couponInfo,
    coupon_discount_amount: couponDiscountAmount,
    final_price: finalPrice,
  };

  const data = {
    data: cartWithPricing,
    total: !user_id ? (cart ? cart.length : 0) : cart ? 1 : 0,
  };

  res.json(new ApiResponse(200, data, "Cart fetched successfully", true));
});

const addToCart = asyncHandler(async (req, res) => {
  const { type, product_id, bundle_id, quantity, variant_sku } = req.body;
  const { _id } = req.user;

  // Validate required fields
  if (!type || quantity === null || quantity === undefined) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Invalid request: type and quantity are required",
          false
        )
      );
  }

  if (type === "product" && !product_id) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Product ID is required for product type",
          false
        )
      );
  }

  if (type === "bundle" && !bundle_id) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          null,
          "Bundle ID is required for bundle type",
          false
        )
      );
  }

  const cartItem = await CartService.updateCart({
    user_id: _id,
    type,
    product_id,
    bundle_id,
    quantity,
    variant_sku,
  });

  if (!cartItem) {
    res.json(new ApiResponse(200, null, "Cart is empty", true));
  } else {
    res.json(
      new ApiResponse(201, cartItem, "Item added to cart successfully", true)
    );
  }
});

const deleteCartItem = asyncHandler(async (req, res) => {
  const { id: user_id } = req.params;

  await CartService.deleteCart(user_id);
  res.json(new ApiResponse(200, null, "Cart deleted successfully", true));
});

module.exports = {
  getCart,
  addToCart,
  deleteCartItem,
};
