const mongoose = require("mongoose");
const ApiResponse = require("../../utils/ApiResponse.js");
const AddressServices = require("../../services/address/index.js");
const { asyncHandler } = require("../../common/asyncHandler.js");
  const Address = require("../../models/addressModel.js");

const getAllAddresses = asyncHandler(async (req, res) => {
  const addresses = await AddressServices.getAllAddresses();
  res.json(
    new ApiResponse(200, addresses, "Addresses fetched successfully", true)
  );
});

const getAddressById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid address ID", false));
  }

  const address = await AddressServices.getAddressById(id);
  if (!address) {
    return res.json(new ApiResponse(404, null, "Address not found", false));
  }

  res.json(new ApiResponse(200, address, "Address fetched successfully", true));
});

const getAddressByUserId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid user ID", false));
  }

  const addresses = await AddressServices.getAddressesByUserId(id);

  if (!addresses || addresses.length === 0) {
    return res.json(
      new ApiResponse(404, [], "No addresses found for this user", false)
    );
  }

  res.json(
    new ApiResponse(200, addresses, "Addresses fetched successfully", true)
  );
});

const createAddress = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { name, mobile, pincode, address, city, state, isPrimary } = req.body;

  if (!name || !mobile || !pincode || !address || !city || !state) {
    return res.json(
      new ApiResponse(400, null, "All required fields must be provided", false)
    );
  }

  const Address = require("../../models/addressModel.js");
  const existingAddresses = await Address.find({ user: userId });
  let finalIsPrimary = !!isPrimary;
  if (existingAddresses.length === 0) {
    finalIsPrimary = true;
  } else if (isPrimary) {
    await Address.updateMany(
      { user: userId, isPrimary: true },
      { isPrimary: false }
    );
  }

  const createdAddress = await AddressServices.createAddress({
    user: userId,
    name,
    mobile,
    pincode,
    address,
    city,
    state,
    isPrimary: finalIsPrimary,
  });
  res.json(
    new ApiResponse(200, createdAddress, "Address created successfully", true)
  );
});

const updateAddress = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { name, mobile, pincode, address, city, state, isPrimary } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid address ID", false));
  }

  const addressDoc = await Address.findOne({ _id: id, user: userId });
  if (!addressDoc) {
    return res.json(new ApiResponse(404, null, "Address not found", false));
  }

  // If isPrimary is being set to true, unset previous primary addresses for this user
  if (isPrimary) {
    await Address.updateMany(
      { user: userId, isPrimary: true },
      { isPrimary: false }
    );
  }

  if (name !== undefined) addressDoc.name = name;
  if (mobile !== undefined) addressDoc.mobile = mobile;
  if (pincode !== undefined) addressDoc.pincode = pincode;
  if (address !== undefined) addressDoc.address = address;
  if (city !== undefined) addressDoc.city = city;
  if (state !== undefined) addressDoc.state = state;
  if (typeof isPrimary !== "undefined") addressDoc.isPrimary = !!isPrimary;

  await addressDoc.save();

  res.json(
    new ApiResponse(200, addressDoc, "Address updated successfully", true)
  );
});

const deleteAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.json(new ApiResponse(400, null, "Invalid address ID", false));
  }

  const address = await AddressServices.deleteAddress(id);
  if (!address) {
    return res.json(new ApiResponse(404, null, "Address not found", false));
  }

  res.json(new ApiResponse(200, null, "Address deleted successfully", true));
});

module.exports = {
  getAllAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
  getAddressByUserId,
};
