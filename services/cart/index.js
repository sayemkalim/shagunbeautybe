const Cart = require("../../models/cartModel.js");
const CartRepository = require("../../repositories/cart/index.js");
const ProductRepository = require("../../repositories/product/index.js");
const BundleRepository = require("../../repositories/bundle/index.js");
const ApiResponse = require("../../utils/ApiResponse.js");

const getCart = async ({ user_id }) => {
  const cart = await CartRepository.getCartByUserId({ user_id });
  return cart;
};

const updateCart = async ({
  user_id,
  type,
  product_id,
  bundle_id,
  quantity,
  variant_sku,
}) => {
  let cart = await CartRepository.getCartByUserId({ user_id });

  if (quantity < 0) {
    throw new Error("Invalid quantity");
  }

  let itemData, itemPrice, item;

  if (type === "product") {
    itemData = await ProductRepository.getProductById(product_id);
    if (!itemData) {
      throw new Error("Product not found");
    }
    
    let itemPrice;
    
    // If variant_sku is provided, use variant-specific pricing
    if (variant_sku && Array.isArray(itemData.variants)) {
      const variant = itemData.variants.find(v => v.sku === variant_sku);
      if (!variant) {
        throw new Error(`Variant with SKU '${variant_sku}' not found`);
      }
      // Use variant's discounted price if available, otherwise use variant's regular price
      itemPrice = variant.discounted_price !== null && variant.discounted_price !== undefined
        ? variant.discounted_price
        : variant.price;
    } else {
      // Use product's main pricing
      itemPrice = itemData.discounted_price !== null
        ? itemData.discounted_price
        : itemData.price;
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
    itemData = await BundleRepository.getBundleById(bundle_id);

    if (!itemData) {
      throw new Error("Bundle not found");
    }

    if (!itemData.is_active) {
      throw new Error("Bundle is not available");
    }

    // Get the appropriate price (discounted if available, otherwise regular price)
    let itemPrice =
      itemData.discounted_price !== null &&
      itemData.discounted_price !== undefined
        ? itemData.discounted_price
        : itemData.price;

    // Ensure itemPrice is a valid number
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

  if (!cart) {
    // If no cart exists and quantity is 0, return empty cart
    if (quantity <= 0) {
      return null;
    }

    // Validate that every item has a type field if items array is present
    let itemsToAdd = [item];
    if (Array.isArray(itemsToAdd)) {
      itemsToAdd.forEach((itm, idx) => {
        if (!itm.type) {
          throw new Error(
            `Cart item at index ${idx} is missing required 'type' field`
          );
        }
      });
    }

    cart = await CartRepository.addToCart({
      user: user_id,
      items: itemsToAdd,
      total_price: item.total,
      is_active: true,
    });
    // Fetch the created cart with populated fields
    cart = await Cart.findOne({ user: user_id })
      .populate("items.product")
      .populate({
        path: "items.bundle",
        populate: {
          path: "products.product",
          model: "Product"
        }
      });
    return cart;
  }

  let existingItemIndex = -1;
  if (type === "product") {
    existingItemIndex = cart.items.findIndex(
      (i) =>
        i.type === "product" &&
        i.product &&
        (i.product.toString() === product_id ||
          (typeof i.product === "object" &&
            i.product._id &&
            i.product._id.toString() === product_id)) &&
        (!variant_sku || i.variant_sku === variant_sku)
    );
  } else if (type === "bundle") {
    existingItemIndex = cart.items.findIndex(
      (i) =>
        i.type === "bundle" &&
        i.bundle &&
        (i.bundle.toString() === bundle_id ||
          (typeof i.bundle === "object" &&
            i.bundle._id &&
            i.bundle._id.toString() === bundle_id))
    );
  }

  if (existingItemIndex !== -1) {
    if (quantity > 0) {
      // Update quantity and preserve the price from the new item
      cart.items[existingItemIndex].quantity = quantity;
      cart.items[existingItemIndex].price = item.price; // Preserve the correct price
      cart.items[existingItemIndex].total = item.price * quantity;
      cart.items[existingItemIndex].updatedAt = new Date();
    } else {
      cart.items.splice(existingItemIndex, 1);
    }
  } else if (quantity > 0) {
    // Create a new cart item object to ensure proper schema handling
    const newCartItem = {
      type: item.type,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      addedAt: item.addedAt,
      updatedAt: item.updatedAt,
    };

    // Add bundle or product reference based on type
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

  // If no items left, delete the cart
  if (cart.items.length === 0) {
    await Cart.deleteOne({ user: user_id });
    return null;
  }

  // The pre-save hook will handle total_price and is_active calculations
  await cart.save();

  cart = await Cart.findOne({ user: user_id })
    .populate("items.product")
    .populate({
      path: "items.bundle",
      populate: {
        path: "products.product",
        model: "Product"
      }
    });

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
