const { asyncHandler } = require("../../common/asyncHandler.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const CartService = require("../../services/cart/index.js");
const CouponService = require("../../services/coupon/index.js");
const { calculateShippingCost } = require("../../utils/shipping/calculateShipping.js");
const Inventory = require("../../models/inventoryModel.js");
const { getAvailableStock } = require("../../utils/inventory/getAvailableStock.js");
const { CartPerfTracker } = require("../../utils/performance/cartPerf.js");

const getCart = asyncHandler(async (req, res) => {
  const perf = new CartPerfTracker("getCart");
  try {
    const user_id = req.user?._id;
    const { couponCode: coupon_code } = req.query;

    const cart = await perf.track("cart_lookup_ms", () =>
      CartService.getCart({ user_id })
    );

    const cartItemsCount = cart?.items?.length || 0;
    perf.setItemCount(cartItemsCount);

    const cartTotalPrice = cart?.total_price || 0;

    // Orders under ₹2000 incur a flat ₹50 shipping charge
    let shippingCharge = 0;
    if (cart && cart.items && cart.items.length > 0) {
      const shippingRes = await perf.track("shipping_calc_ms", () =>
        calculateShippingCost(cartTotalPrice)
      );
      shippingCharge = shippingRes.shippingCost;
    }

    // Validate coupon (if provided) against the cart's item total, before shipping
    let couponInfo = null;
    let couponDiscountAmount = 0;
    if (coupon_code && user_id && cart && cart.items && cart.items.length > 0) {
      const couponResult = await perf.track("coupon_validate_ms", () =>
        CouponService.validateCoupon({
          code: coupon_code,
          userId: user_id,
          orderTotal: cartTotalPrice,
        })
      );

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

    if (
      cartWithPricing &&
      Array.isArray(cartWithPricing.items) &&
      cartWithPricing.items.length > 0
    ) {
      const productIds = cartWithPricing.items
        .filter((i) => i.product)
        .map((i) =>
          i.product._id ? i.product._id.toString() : i.product.toString()
        );

      const uniqueProductIds = Array.from(new Set(productIds));

      const inventoryRecords = await perf.track("inventory_lookup_ms", () =>
        Inventory.find({
          product: { $in: uniqueProductIds },
        })
          .select("product variant_sku quantity_on_hand reserved_quantity")
          .lean()
      );

      const inventoryMap = new Map();
      const variantInventoryMap = new Map();

      inventoryRecords.forEach((inv) => {
        const avail = Math.max(inv.quantity_on_hand - inv.reserved_quantity, 0);
        if (inv.variant_sku) {
          variantInventoryMap.set(
            `${inv.product.toString()}_${inv.variant_sku}`,
            avail
          );
        } else {
          inventoryMap.set(inv.product.toString(), avail);
        }
      });

      cartWithPricing.items = cartWithPricing.items.map((item) => {
        const pId = item.product?._id
          ? item.product._id.toString()
          : item.product?.toString();

        let itemProductObj =
          item.product && typeof item.product === "object"
            ? item.product.toObject
              ? item.product.toObject()
              : { ...item.product }
            : null;

        if (itemProductObj) {
          const baseAvail = inventoryMap.has(pId)
            ? inventoryMap.get(pId)
            : itemProductObj.base_available_inventory !== undefined
            ? itemProductObj.base_available_inventory
            : itemProductObj.inventory || 0;
          itemProductObj.base_available_inventory = baseAvail;

          if (Array.isArray(itemProductObj.variants)) {
            itemProductObj.variants = itemProductObj.variants.map((v) => {
              const vKey = `${pId}_${v.sku}`;
              const vAvail = variantInventoryMap.has(vKey)
                ? variantInventoryMap.get(vKey)
                : v.available_inventory !== undefined
                ? v.available_inventory
                : v.inventory || 0;
              return {
                ...v,
                available_inventory: vAvail,
              };
            });
          }
        }

        const avail = itemProductObj
          ? getAvailableStock(itemProductObj, item.variant_sku || null)
          : item.variant_sku
          ? variantInventoryMap.get(`${pId}_${item.variant_sku}`) || 0
          : inventoryMap.get(pId) || 0;

        return {
          ...item,
          available_inventory: avail,
          product: itemProductObj
            ? { ...itemProductObj, available_inventory: avail }
            : item.product,
        };
      });
    }

    const data = {
      data: cartWithPricing,
      total: !user_id ? (cart ? cart.length : 0) : cart ? 1 : 0,
    };

    perf.end();
    res.json(new ApiResponse(200, data, "Cart fetched successfully", true));
  } catch (error) {
    perf.end({ error: error.message });
    throw error;
  }
});

const addToCart = asyncHandler(async (req, res) => {
  const perf = new CartPerfTracker("addToCart");
  try {
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
      perfTracker: perf,
    });

    perf.end();

    if (!cartItem) {
      res.json(new ApiResponse(200, null, "Cart is empty", true));
    } else {
      res.json(
        new ApiResponse(201, cartItem, "Item added to cart successfully", true)
      );
    }
  } catch (error) {
    perf.end({ error: error.message });
    throw error;
  }
});

const deleteCartItem = asyncHandler(async (req, res) => {
  const perf = new CartPerfTracker("deleteCart");
  try {
    const { id: user_id } = req.params;

    await perf.track("cart_delete_ms", () =>
      CartService.deleteCart(user_id)
    );

    perf.end();
    res.json(new ApiResponse(200, null, "Cart deleted successfully", true));
  } catch (error) {
    perf.end({ error: error.message });
    throw error;
  }
});

module.exports = {
  getCart,
  addToCart,
  deleteCartItem,
};
