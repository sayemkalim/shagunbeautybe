const express = require("express");
const router = express.Router();
const AddressController = require("../../controllers/address/index.js");
const { user } = require("../../middleware/auth/userMiddleware.js");

router.get("/", user, AddressController.getAllAddresses);
router.get("/user/:id", user, AddressController.getAddressByUserId);
router.get("/:id", user, AddressController.getAddressById);
router.post("/", user, AddressController.createAddress);
router.put("/:id", user, AddressController.updateAddress);
router.delete("/:id", user, AddressController.deleteAddress);

module.exports = router;
