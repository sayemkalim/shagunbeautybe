const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const CartService = require("../../services/cart/index.js");
const DeliveryZoneService = require("../../services/delivery_zone/index.js");
const Address = require("../../models/addressModel.js");
const Product = require("../../models/productsModel.js");
const Bundle = require("../../models/bundleModel.js");

const getCart = asyncHandler(async (req, res) => {
  const user_id = req.user?._id;
  const { addressId: address_id } = req.query;

  const cart = await CartService.getCart({ user_id });

  let shippingCharge = 0;

  // Calculate shipping charge if user is logged in and cart exists
  if (user_id && cart && cart.items && cart.items.length > 0) {
    let selectedAddress = null;

    // If address_id is provided, use that address
    if (address_id) {
      selectedAddress = await Address.findOne({
        _id: address_id,
        user: user_id,
      });
    } else {
      // Otherwise, use primary address
      selectedAddress = await Address.findOne({
        user: user_id,
        isPrimary: true,
      });
    }

    if (selectedAddress && selectedAddress.pincode) {
      // Calculate total weight of all items in cart
      let totalWeight = 0;

      for (const item of cart.items) {
  let itemWeight = 0;

  try {
    if (item.type === "product" && item.product) {
      const product = await Product.findById(item.product)
        .select("weight_in_grams")
        .lean();
      itemWeight = product?.weight_in_grams || 0;
    } else if (item.type === "bundle" && item.bundle) {
      const bundle = await Bundle.findById(item.bundle)
        .populate({ path: "products.product", select: "weight_in_grams" })
        .lean();
      if (bundle?.products && Array.isArray(bundle.products)) {
        itemWeight = bundle.products.reduce((sum, bundleProduct) => {
          const productWeight = bundleProduct.product?.weight_in_grams || 0;
          const productQty = bundleProduct.quantity || 1;
          return sum + productWeight * productQty;
        }, 0);
      }
    }
  } catch (weightError) {
    // If weight lookup fails for any item, skip it — shipping will fall back to 0
    console.error("Weight lookup failed for item:", item._id, weightError.message);
    itemWeight = 0;
  }

  totalWeight += itemWeight * (item.quantity || 1);
}

      // Calculate shipping charge if total weight is available
      if (totalWeight > 0) {
        const deliveryPriceResult =
          await DeliveryZoneService.calculateDeliveryPrice(
            selectedAddress.pincode,
            totalWeight
          );

        if (deliveryPriceResult.success) {
          shippingCharge = deliveryPriceResult.delivery_price || 0;
        }
      }
    }
  }

  const cartTotalPrice = cart?.total_price || 0;
  const finalPrice = cartTotalPrice + shippingCharge;

  // Add shipping and final price to cart object
  const cartWithPricing = {
    ...(cart.toObject() || {}),
    shipping_charge: shippingCharge,
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
