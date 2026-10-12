const Cart = require("../../models/cartModel.js");
const CartRepository = require("../../repositories/cart/index.js");
const ProductRepository = require("../../repositories/product/index.js");
const BundleRepository = require("../../repositories/bundle/index.js");
const ApiResponse = require("../../utils/ApiResponse.js");
const {
  getProductQuantityOptions,
  resolveProductUnitPrice,
} = require("../../utils/pricing/index.js");

const getCart = async ({ user_id }) => {
  let cart = await CartRepository.getCartByUserId({ user_id });
  if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
    let priceChanged = false;
    let newCartTotal = 0;

    cart.items.forEach((item) => {
      if (item.type === "product" && item.product) {
        const prod = item.product;
        let currentUnitPrice = 0;

        if (item.variant_sku && Array.isArray(prod.variants)) {
          const variant = prod.variants.find((v) => v.sku === item.variant_sku);
          if (variant) {
            currentUnitPrice = resolveProductUnitPrice(variant, item.quantity || 1);
          }
        } else {
          currentUnitPrice = resolveProductUnitPrice(prod, item.quantity || 1);
        }

        if (currentUnitPrice > 0) {
          const currentItemTotal = currentUnitPrice * (item.quantity || 1);
          if (item.price !== currentUnitPrice || item.total !== currentItemTotal) {
            item.price = currentUnitPrice;
            item.total = currentItemTotal;
            priceChanged = true;
          }
        }
      }
      newCartTotal += item.total || (item.price || 0) * (item.quantity || 1) || 0;
    });

    if (priceChanged) {
      cart.total_price = newCartTotal;
      await cart.save();
    }
  }
  return cart;
};

const Product = require("../../models/productsModel.js");

const updateCart = async ({
  user_id,
  type,
  product_id,
  bundle_id,
  quantity,
  variant_sku,
  perfTracker,
}) => {
  quantity = Number(quantity);

  if (quantity < 0) {
    throw new Error("Invalid quantity");
  }

  // 1. Fetch raw cart without populate (fast index scan on user)
  let cart;
  if (perfTracker) {
    cart = await perfTracker.track("cart_lookup_ms", () =>
      CartRepository.getRawCartByUserId({ user_id })
    );
  } else {
    cart = await CartRepository.getRawCartByUserId({ user_id });
  }

  if (perfTracker && cart) {
    perfTracker.setItemCount(cart.items?.length || 0);
  }

  // Handle Remove / Quantity 0 scenario
  if (quantity === 0) {
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return null;
    }

    let existingItemIndex = -1;
    if (type === "product") {
      const targetIdStr = product_id.toString();
      const targetVariant = variant_sku || null;
      existingItemIndex = cart.items.findIndex(
        (i) =>
          i.type === "product" &&
          i.product &&
          (i.product.toString() === targetIdStr ||
            (i.product._id && i.product._id.toString() === targetIdStr)) &&
          ((i.variant_sku || null) === targetVariant)
      );
    } else if (type === "bundle") {
      const targetIdStr = bundle_id.toString();
      existingItemIndex = cart.items.findIndex(
        (i) =>
          i.type === "bundle" &&
          i.bundle &&
          (i.bundle.toString() === targetIdStr ||
            (i.bundle._id && i.bundle._id.toString() === targetIdStr))
      );
    }

    if (existingItemIndex !== -1) {
      cart.items.splice(existingItemIndex, 1);
    }

    if (cart.items.length === 0) {
      if (perfTracker) {
        await perfTracker.track("cart_save_ms", () =>
          Cart.deleteOne({ _id: cart._id })
        );
      } else {
        await Cart.deleteOne({ _id: cart._id });
      }
      return null;
    }

    if (perfTracker) {
      await perfTracker.track("cart_save_ms", () => cart.save());
      await perfTracker.track("cart_populate_ms", () =>
        CartRepository.populateCart(cart)
      );
    } else {
      await cart.save();
      await CartRepository.populateCart(cart);
    }

    return cart;
  }

  // Handle Add / Quantity > 0 scenario
  let itemData, itemPrice, item;

  if (type === "product") {
    const productLookupFn = async () => {
      return await Product.findById(product_id)
        .select("price discounted_price variants price_tiers status is_out_of_stock")
        .lean();
    };

    itemData = perfTracker
      ? await perfTracker.track("product_lookup_ms", productLookupFn)
      : await productLookupFn();

    if (!itemData) {
      throw new Error("Product not found");
    }

    itemPrice = 0;

    // If variant_sku is provided, use variant-specific pricing (tier-aware)
    if (variant_sku && Array.isArray(itemData.variants)) {
      const variant = itemData.variants.find((v) => v.sku === variant_sku);
      if (!variant) {
        throw new Error(`Variant with SKU '${variant_sku}' not found`);
      }
      itemPrice = resolveProductUnitPrice(variant, quantity);
    } else {
      itemPrice = resolveProductUnitPrice(itemData, quantity);
    }

    if (isNaN(itemPrice) || itemPrice === null || itemPrice === undefined) {
      itemPrice = 0;
    }

    item = {
      type: "product",
      product: product_id,
      quantity,
      price: itemPrice,
      total: itemPrice * quantity,
      addedAt: new Date(),
      updatedAt: new Date(),
    };
    if (variant_sku) item.variant_sku = variant_sku;
  } else if (type === "bundle") {
    const bundleLookupFn = async () => {
      return await BundleRepository.getBundleById(bundle_id);
    };

    itemData = perfTracker
      ? await perfTracker.track("product_lookup_ms", bundleLookupFn)
      : await bundleLookupFn();

    if (!itemData) {
      throw new Error("Bundle not found");
    }

    if (!itemData.is_active) {
      throw new Error("Bundle is not available");
    }

    let itemPrice =
      itemData.discounted_price !== null &&
      itemData.discounted_price !== undefined
        ? itemData.discounted_price
        : itemData.price;

    if (isNaN(itemPrice) || itemPrice <= 0) {
      throw new Error("Invalid bundle price");
    }

    item = {
      type: "bundle",
      bundle: bundle_id,
      quantity,
      price: itemPrice,
      total: itemPrice * quantity,
      addedAt: new Date(),
      updatedAt: new Date(),
    };
  } else {
    throw new Error("Invalid type. Must be 'product' or 'bundle'");
  }

  // If no cart exists yet, create it
  if (!cart) {
    const itemsToAdd = [item];
    const createCartFn = async () => {
      const newCart = await CartRepository.addToCart({
        user: user_id,
        items: itemsToAdd,
        total_price: item.total,
        is_active: true,
      });
      await CartRepository.populateCart(newCart);
      return newCart;
    };

    if (perfTracker) {
      cart = await perfTracker.track("cart_save_ms", createCartFn);
    } else {
      cart = await createCartFn();
    }
    return cart;
  }

  // Existing cart: find index of matching item
  let existingItemIndex = -1;
  if (type === "product") {
    const targetIdStr = product_id.toString();
    const targetVariant = variant_sku || null;
    existingItemIndex = cart.items.findIndex(
      (i) =>
        i.type === "product" &&
        i.product &&
        (i.product.toString() === targetIdStr ||
          (i.product._id && i.product._id.toString() === targetIdStr)) &&
        ((i.variant_sku || null) === targetVariant)
    );
  } else if (type === "bundle") {
    const targetIdStr = bundle_id.toString();
    existingItemIndex = cart.items.findIndex(
      (i) =>
        i.type === "bundle" &&
        i.bundle &&
        (i.bundle.toString() === targetIdStr ||
          (i.bundle._id && i.bundle._id.toString() === targetIdStr))
    );
  }

  if (existingItemIndex !== -1) {
    // Update existing item
    cart.items[existingItemIndex].quantity = quantity;
    cart.items[existingItemIndex].price = item.price;
    cart.items[existingItemIndex].total = item.price * quantity;
    cart.items[existingItemIndex].updatedAt = new Date();
  } else {
    // Push new item
    const newCartItem = {
      type: item.type,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      addedAt: item.addedAt,
      updatedAt: item.updatedAt,
    };
    if (item.type === "bundle") {
      newCartItem.bundle = item.bundle;
    } else if (item.type === "product") {
      newCartItem.product = item.product;
      if (item.variant_sku) {
        newCartItem.variant_sku = item.variant_sku;
      }
    }
    cart.items.push(newCartItem);
  }

  // Save cart and populate directly in memory
  if (perfTracker) {
    await perfTracker.track("cart_save_ms", () => cart.save());
    await perfTracker.track("cart_populate_ms", () =>
      CartRepository.populateCart(cart)
    );
  } else {
    await cart.save();
    await CartRepository.populateCart(cart);
  }

  return cart;
};

const deleteCart = async (user_id) => {
  const deletedCart = await CartRepository.deleteCartByUserId(user_id);
  if (!deletedCart) {
    throw new Error("Cart not found");
  }
  return deletedCart;
};

module.exports = {
  getCart,
  updateCart,
  deleteCart,
};
