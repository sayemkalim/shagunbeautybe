const express = require("express");
const CartController = require("../../controllers/cart/index.js");
const { user } = require("../../middleware/auth/userMiddleware.js");
const router = express.Router();

router.get("/", user, CartController.getCart);
router.post("/", user, CartController.addToCart);
router.delete("/:id", user, CartController.deleteCartItem);

module.exports = router;
