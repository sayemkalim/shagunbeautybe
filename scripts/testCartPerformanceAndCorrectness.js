const mongoose = require("mongoose");
const { performance } = require("perf_hooks");
const Cart = require("../models/cartModel.js");
const Product = require("../models/productsModel.js");
const CartService = require("../services/cart/index.js");
const CartRepository = require("../repositories/cart/index.js");
const { CartPerfTracker } = require("../utils/performance/cartPerf.js");

// Percentile helper
function getPercentiles(arr) {
  if (arr.length === 0) return { median: 0, p95: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  return {
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

// Generate mock product catalog
function generateCatalog(count) {
  const products = [];
  for (let i = 1; i <= count; i++) {
    const id = new mongoose.Types.ObjectId();
    products.push({
      _id: id,
      name: `Beauty Product ${i}`,
      sku: `SKU-${i.toString().padStart(4, "0")}`,
      price: 500 + (i % 10) * 50,
      discounted_price: 450 + (i % 10) * 50,
      status: "published",
      is_out_of_stock: false,
      inventory: 100,
      base_available_inventory: 100,
      available_inventory: 100,
      weight_in_grams: 150,
      variants: [
        {
          _id: new mongoose.Types.ObjectId(),
          sku: `SKU-${i}-RED`,
          name: "Red Shade",
          price: 520,
          discounted_price: 470,
          inventory: 50,
          available_inventory: 50,
          is_out_of_stock: false,
          status: "published",
        },
        {
          _id: new mongoose.Types.ObjectId(),
          sku: `SKU-${i}-BLUE`,
          name: "Blue Shade",
          price: 540,
          discounted_price: 490,
          inventory: 50,
          available_inventory: 50,
          is_out_of_stock: false,
          status: "published",
        },
      ],
      price_tiers: [
        { quantity: 2, price: 420 },
        { quantity: 5, price: 380 },
      ],
    });
  }
  return products;
}

// Emulate DB storage with realistic network round-trip simulation
class MockDatabase {
  constructor(networkLatencyMs = 15) {
    this.networkLatencyMs = networkLatencyMs;
    this.products = new Map();
    this.carts = new Map();
    this.opCounts = {
      cartFind: 0,
      cartSave: 0,
      cartDelete: 0,
      productFind: 0,
      populate: 0,
    };
  }

  async delay() {
    if (this.networkLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.networkLatencyMs));
    }
  }

  resetOpCounts() {
    this.opCounts = {
      cartFind: 0,
      cartSave: 0,
      cartDelete: 0,
      productFind: 0,
      populate: 0,
    };
  }

  seedProducts(products) {
    for (const p of products) {
      this.products.set(p._id.toString(), p);
    }
  }

  async findCartByUser(userId) {
    this.opCounts.cartFind++;
    await this.delay();
    const doc = this.carts.get(userId.toString());
    if (!doc) return null;
    return this.createCartMongooseInstance(JSON.parse(JSON.stringify(doc)));
  }

  async saveCart(cartDoc) {
    this.opCounts.cartSave++;
    await this.delay();
    const raw = cartDoc.toObject ? cartDoc.toObject() : cartDoc;
    this.carts.set(raw.user.toString(), raw);
    return cartDoc;
  }

  async deleteCart(userId) {
    this.opCounts.cartDelete++;
    await this.delay();
    return this.carts.delete(userId.toString());
  }

  async findProductById(id, selectFields = null) {
    this.opCounts.productFind++;
    await this.delay();
    const p = this.products.get(id.toString());
    if (!p) return null;
    return JSON.parse(JSON.stringify(p));
  }

  async populateItems(cartDoc, selectFields = null) {
    this.opCounts.populate++;
    await this.delay(); // One network round-trip for $in query across distinct products
    for (const item of cartDoc.items) {
      if (item.type === "product" && item.product) {
        const pId = item.product._id ? item.product._id.toString() : item.product.toString();
        const p = this.products.get(pId);
        if (p) {
          item.product = JSON.parse(JSON.stringify(p));
        }
      }
    }
    return cartDoc;
  }

  createCartMongooseInstance(raw) {
    const cart = new Cart(raw);
    const self = this;
    cart.save = async function () {
      // Trigger Mongoose pre-save
      await new Promise((resolve, reject) => {
        const next = (err) => (err ? reject(err) : resolve());
        Cart.schema.s.hooks.execPre("save", cart, next);
      });
      return await self.saveCart(cart);
    };
    return cart;
  }
}

// Implement Baseline updateCart (representing the unoptimized code)
async function baselineUpdateCart(mockDb, { user_id, type, product_id, quantity, variant_sku }) {
  // 1. Initial cart lookup WITH FULL POPULATION
  mockDb.opCounts.cartFind++;
  await mockDb.delay();
  let cartRaw = mockDb.carts.get(user_id.toString());
  let cart = cartRaw ? mockDb.createCartMongooseInstance(JSON.parse(JSON.stringify(cartRaw))) : null;

  if (cart) {
    // Baseline always populated all 50 items at the start
    await mockDb.populateItems(cart);
  }

  quantity = Number(quantity);
  if (quantity < 0) throw new Error("Invalid quantity");

  // 2. Baseline ALWAYS looked up product, even when quantity === 0 (and populated brand)
  mockDb.opCounts.productFind++;
  await mockDb.delay();
  const itemData = mockDb.products.get(product_id.toString());
  if (!itemData) throw new Error("Product not found");

  let itemPrice = itemData.discounted_price || itemData.price;
  if (variant_sku && itemData.variants) {
    const v = itemData.variants.find((x) => x.sku === variant_sku);
    if (!v) throw new Error(`Variant with SKU '${variant_sku}' not found`);
    itemPrice = v.discounted_price || v.price;
  }

  const item = {
    type: "product",
    product: product_id,
    quantity,
    price: itemPrice,
    total: itemPrice * quantity,
    addedAt: new Date(),
    updatedAt: new Date(),
    variant_sku,
  };

  if (!cart) {
    if (quantity <= 0) return null;
    cart = mockDb.createCartMongooseInstance({
      user: user_id,
      items: [item],
      total_price: item.total,
      is_active: true,
    });
    await mockDb.saveCart(cart);
    await mockDb.populateItems(cart);
    return cart;
  }

  const targetVariant = variant_sku || null;
  const existingIndex = cart.items.findIndex(
    (i) =>
      i.type === "product" &&
      i.product &&
      (i.product.toString() === product_id.toString() ||
        (i.product._id && i.product._id.toString() === product_id.toString())) &&
      (i.variant_sku || null) === targetVariant
  );

  if (existingIndex !== -1) {
    if (quantity > 0) {
      cart.items[existingIndex].quantity = quantity;
      cart.items[existingIndex].price = item.price;
      cart.items[existingIndex].total = item.price * quantity;
      cart.items[existingIndex].updatedAt = new Date();
    } else {
      cart.items.splice(existingIndex, 1);
    }
  } else if (quantity > 0) {
    cart.items.push(item);
  }

  if (cart.items.length === 0) {
    await mockDb.deleteCart(user_id);
    return null;
  }

  // Old pre-save updated updatedAt on ALL 50 items
  for (const itm of cart.items) {
    itm.updatedAt = new Date();
  }
  cart.total_price = cart.items.reduce((s, itm) => s + (itm.total || 0), 0);
  await mockDb.saveCart(cart);

  // 3. Baseline performed a SECOND findOne + full populate
  mockDb.opCounts.cartFind++;
  await mockDb.delay();
  await mockDb.populateItems(cart);

  return cart;
}

// Implement Optimized updateCart
async function optimizedUpdateCart(mockDb, { user_id, type, product_id, quantity, variant_sku }) {
  quantity = Number(quantity);
  if (quantity < 0) throw new Error("Invalid quantity");

  // 1. Raw cart lookup without populate
  let cart = await mockDb.findCartByUser(user_id);

  // 2. Remove case: No product query needed at all!
  if (quantity === 0) {
    if (!cart || !cart.items || cart.items.length === 0) return null;

    const targetVariant = variant_sku || null;
    const existingIndex = cart.items.findIndex(
      (i) =>
        i.type === "product" &&
        i.product &&
        (i.product.toString() === product_id.toString() ||
          (i.product._id && i.product._id.toString() === product_id.toString())) &&
        (i.variant_sku || null) === targetVariant
    );

    if (existingIndex !== -1) {
      cart.items.splice(existingIndex, 1);
    }

    if (cart.items.length === 0) {
      await mockDb.deleteCart(user_id);
      return null;
    }

    await cart.save();
    await mockDb.populateItems(cart);
    return cart;
  }

  // 3. Add case: Lightweight product query
  const itemData = await mockDb.findProductById(product_id);
  if (!itemData) throw new Error("Product not found");

  const { resolveProductUnitPrice } = require("../utils/pricing/index.js");
  let itemPrice = 0;
  if (variant_sku && itemData.variants) {
    const v = itemData.variants.find((x) => x.sku === variant_sku);
    if (!v) throw new Error(`Variant with SKU '${variant_sku}' not found`);
    itemPrice = resolveProductUnitPrice(v, quantity);
  } else {
    itemPrice = resolveProductUnitPrice(itemData, quantity);
  }

  const item = {
    type: "product",
    product: product_id,
    quantity,
    price: itemPrice,
    total: itemPrice * quantity,
    addedAt: new Date(),
    updatedAt: new Date(),
    variant_sku,
  };

  if (!cart) {
    cart = mockDb.createCartMongooseInstance({
      user: user_id,
      items: [item],
      total_price: item.total,
      is_active: true,
    });
    await mockDb.saveCart(cart);
    await mockDb.populateItems(cart);
    return cart;
  }

  const targetVariant = variant_sku || null;
  const existingIndex = cart.items.findIndex(
    (i) =>
      i.type === "product" &&
      i.product &&
      (i.product.toString() === product_id.toString() ||
        (i.product._id && i.product._id.toString() === product_id.toString())) &&
      (i.variant_sku || null) === targetVariant
  );

  if (existingIndex !== -1) {
    cart.items[existingIndex].quantity = quantity;
    cart.items[existingIndex].price = item.price;
    cart.items[existingIndex].total = item.price * quantity;
    cart.items[existingIndex].updatedAt = new Date();
  } else {
    cart.items.push(item);
  }

  await cart.save();
  await mockDb.populateItems(cart);
  return cart;
}

// Populate a cart with N items
function seedCartWithItems(mockDb, userId, products, count) {
  const items = [];
  let total_price = 0;
  for (let i = 0; i < count; i++) {
    const p = products[i];
    const qty = 1 + (i % 3);
    const price = p.discounted_price || p.price;
    const total = qty * price;
    total_price += total;
    items.push({
      _id: new mongoose.Types.ObjectId(),
      type: "product",
      product: p._id,
      variant_sku: i % 2 === 0 ? p.variants[0]?.sku : null,
      quantity: qty,
      price,
      total,
      addedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const cartDoc = {
    _id: new mongoose.Types.ObjectId(),
    user: userId,
    items,
    total_price,
    is_active: items.length > 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  mockDb.carts.set(userId.toString(), cartDoc);
  return cartDoc;
}

async function runBenchmark() {
  console.log("===============================================================");
  console.log("   SHAGUN BEAUTY CART PERFORMANCE BENCHMARK & CORRECTNESS TEST");
  console.log("===============================================================\n");

  const catalog = generateCatalog(150);
  const itemSizes = [1, 10, 25, 50, 100];
  const benchmarkResults = [];

  for (const size of itemSizes) {
    const mockDbBaseline = new MockDatabase(15); // 15ms simulated Atlas round-trip
    mockDbBaseline.seedProducts(catalog);

    const mockDbOptimized = new MockDatabase(15);
    mockDbOptimized.seedProducts(catalog);

    const userIdBaseline = new mongoose.Types.ObjectId();
    const userIdOptimized = new mongoose.Types.ObjectId();

    seedCartWithItems(mockDbBaseline, userIdBaseline, catalog, size);
    seedCartWithItems(mockDbOptimized, userIdOptimized, catalog, size);

    const targetProduct = catalog[size % catalog.length];
    const iterations = 10;

    // Test Baseline
    const baselineLatencies = [];
    mockDbBaseline.resetOpCounts();
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await baselineUpdateCart(mockDbBaseline, {
        user_id: userIdBaseline,
        type: "product",
        product_id: targetProduct._id,
        quantity: 2 + (i % 3),
        variant_sku: targetProduct.variants[0].sku,
      });
      baselineLatencies.push(performance.now() - t0);
    }
    const baselineOps = { ...mockDbBaseline.opCounts };
    const baselineStats = getPercentiles(baselineLatencies);

    // Test Optimized
    const optLatencies = [];
    mockDbOptimized.resetOpCounts();
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await optimizedUpdateCart(mockDbOptimized, {
        user_id: userIdOptimized,
        type: "product",
        product_id: targetProduct._id,
        quantity: 2 + (i % 3),
        variant_sku: targetProduct.variants[0].sku,
      });
      optLatencies.push(performance.now() - t0);
    }
    const optOps = { ...mockDbOptimized.opCounts };
    const optStats = getPercentiles(optLatencies);

    // Test Remove (quantity: 0)
    mockDbBaseline.resetOpCounts();
    const t0BaseRemove = performance.now();
    await baselineUpdateCart(mockDbBaseline, {
      user_id: userIdBaseline,
      type: "product",
      product_id: targetProduct._id,
      quantity: 0,
      variant_sku: targetProduct.variants[0].sku,
    });
    const baselineRemoveMs = Number((performance.now() - t0BaseRemove).toFixed(2));
    const baselineRemoveOps = Object.values(mockDbBaseline.opCounts).reduce((a, b) => a + b, 0);

    mockDbOptimized.resetOpCounts();
    const t0OptRemove = performance.now();
    await optimizedUpdateCart(mockDbOptimized, {
      user_id: userIdOptimized,
      type: "product",
      product_id: targetProduct._id,
      quantity: 0,
      variant_sku: targetProduct.variants[0].sku,
    });
    const optRemoveMs = Number((performance.now() - t0OptRemove).toFixed(2));
    const optRemoveOps = Object.values(mockDbOptimized.opCounts).reduce((a, b) => a + b, 0);

    const totalBaselineOpsPerAdd = Object.values(baselineOps).reduce((a, b) => a + b, 0) / iterations;
    const totalOptOpsPerAdd = Object.values(optOps).reduce((a, b) => a + b, 0) / iterations;

    benchmarkResults.push({
      size,
      baselineMedian: baselineStats.median,
      baselineP95: baselineStats.p95,
      baselineOps: totalBaselineOpsPerAdd,
      optMedian: optStats.median,
      optP95: optStats.p95,
      optOps: totalOptOpsPerAdd,
      improvementMedian: ((baselineStats.median - optStats.median) / baselineStats.median * 100).toFixed(1) + "%",
      baselineRemoveMs,
      baselineRemoveOps,
      optRemoveMs,
      optRemoveOps,
      removeImprovement: ((baselineRemoveMs - optRemoveMs) / baselineRemoveMs * 100).toFixed(1) + "%",
    });
  }

  console.log("--- RESULTS SUMMARY (Add / Update Quantity) ---");
  console.table(
    benchmarkResults.map((r) => ({
      "Cart Items": r.size,
      "Baseline Med (ms)": r.baselineMedian,
      "Baseline p95 (ms)": r.baselineP95,
      "Baseline DB Ops": r.baselineOps,
      "Optimized Med (ms)": r.optMedian,
      "Optimized p95 (ms)": r.optP95,
      "Optimized DB Ops": r.optOps,
      "Latency Reduction": r.improvementMedian,
    }))
  );

  console.log("\n--- RESULTS SUMMARY (Remove from Cart: quantity=0) ---");
  console.table(
    benchmarkResults.map((r) => ({
      "Cart Items": r.size,
      "Baseline Remove (ms)": r.baselineRemoveMs,
      "Baseline Remove DB Ops": r.baselineRemoveOps,
      "Optimized Remove (ms)": r.optRemoveMs,
      "Optimized Remove DB Ops": r.optRemoveOps,
      "Latency Reduction": r.removeImprovement,
    }))
  );

  // Correctness test suite
  console.log("\n===============================================================");
  console.log("   CORRECTNESS VERIFICATION TEST SUITE");
  console.log("===============================================================\n");

  const testDb = new MockDatabase(0);
  testDb.seedProducts(catalog);
  const testUserId = new mongoose.Types.ObjectId();

  let passCount = 0;
  let totalTests = 0;

  function assert(testName, condition, detail = "") {
    totalTests++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passCount++;
    } else {
      console.error(`  ✗ [FAIL] ${testName} - ${detail}`);
    }
  }

  // Test 1: Add new product to empty cart (catalog[0] discounted_price = 500)
  const cart1 = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 1,
    variant_sku: null,
  });
  assert("Add new product to empty cart", cart1 && cart1.items.length === 1 && cart1.total_price === 500);

  // Test 2: Increase quantity of existing product to 3 (3 * 500 = 1500)
  const cart2 = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 3,
    variant_sku: null,
  });
  assert(
    "Increase existing product quantity to 3",
    cart2 && cart2.items.length === 1 && cart2.items[0].quantity === 3 && cart2.total_price === 1500
  );

  // Test 3: Bulk price tier applies on quantity match (qty=2 -> tier price 420 * 2 = 840)
  const cartTier = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 2,
    variant_sku: null,
  });
  assert(
    "Price tier applied correctly on qty=2",
    cartTier && cartTier.items[0].price === 420 && cartTier.items[0].total === 840
  );

  // Test 4: Add different variant of the same product
  const cartVariant = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 1,
    variant_sku: catalog[0].variants[0].sku, // Red Shade
  });
  assert(
    "Add different variant of same product creates distinct line item",
    cartVariant && cartVariant.items.length === 2
  );

  // Test 5: Add a second different variant (Blue Shade)
  const cartVariant2 = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 2,
    variant_sku: catalog[0].variants[1].sku, // Blue Shade
  });
  assert(
    "Add second variant creates third distinct line item",
    cartVariant2 && cartVariant2.items.length === 3
  );

  // Test 6: Decrease quantity
  const cartDec = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 1,
    variant_sku: catalog[0].variants[1].sku,
  });
  const blueItem = cartDec.items.find((i) => i.variant_sku === catalog[0].variants[1].sku);
  assert("Decrease quantity correctly updates item and total", blueItem && blueItem.quantity === 1);

  // Test 7: Remove specific variant (qty = 0)
  const cartRem = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 0,
    variant_sku: catalog[0].variants[1].sku,
  });
  assert(
    "Remove specific variant leaves other variants intact",
    cartRem && cartRem.items.length === 2 && !cartRem.items.some((i) => i.variant_sku === catalog[0].variants[1].sku)
  );

  // Test 8: Invalid product ID throws error
  let caughtInvalid = false;
  try {
    await optimizedUpdateCart(testDb, {
      user_id: testUserId,
      type: "product",
      product_id: new mongoose.Types.ObjectId(),
      quantity: 1,
    });
  } catch (err) {
    caughtInvalid = err.message === "Product not found";
  }
  assert("Invalid product ID throws 'Product not found'", caughtInvalid);

  // Test 9: Invalid variant SKU throws error
  let caughtVariantErr = false;
  try {
    await optimizedUpdateCart(testDb, {
      user_id: testUserId,
      type: "product",
      product_id: catalog[0]._id,
      quantity: 1,
      variant_sku: "NON_EXISTENT_SKU",
    });
  } catch (err) {
    caughtVariantErr = err.message.includes("not found");
  }
  assert("Invalid variant SKU throws error", caughtVariantErr);

  // Test 10: Negative quantity throws error
  let caughtNegative = false;
  try {
    await optimizedUpdateCart(testDb, {
      user_id: testUserId,
      type: "product",
      product_id: catalog[0]._id,
      quantity: -1,
    });
  } catch (err) {
    caughtNegative = err.message === "Invalid quantity";
  }
  assert("Negative quantity throws 'Invalid quantity'", caughtNegative);

  // Test 11: Remove all remaining items deletes cart
  await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 0,
    variant_sku: null,
  });
  const cartFinal = await optimizedUpdateCart(testDb, {
    user_id: testUserId,
    type: "product",
    product_id: catalog[0]._id,
    quantity: 0,
    variant_sku: catalog[0].variants[0].sku,
  });
  assert("Removing all items deletes the cart and returns null", cartFinal === null && !testDb.carts.has(testUserId.toString()));

  // Test 12: Concurrent Add requests handled safely
  const concurrentUserId = new mongoose.Types.ObjectId();
  const concurrentPromises = [1, 2, 3, 4, 5].map((i) =>
    optimizedUpdateCart(testDb, {
      user_id: concurrentUserId,
      type: "product",
      product_id: catalog[i]._id,
      quantity: 1,
    })
  );
  const results = await Promise.allSettled(concurrentPromises);
  const allSucceeded = results.every((r) => r.status === "fulfilled");
  assert("Concurrent requests execute without fatal exceptions", allSucceeded);

  console.log(`\nTests passed: ${passCount} / ${totalTests}`);
  if (passCount === totalTests) {
    console.log("All correctness tests passed successfully!\n");
  } else {
    process.exitCode = 1;
  }
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
