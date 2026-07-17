const Address = require("../../models/addressModel")

const getAllAddresses = async () => {
  return await Address.find();
};

const getAddressById = async (id) => {
  return await Address.findById(id);
};

const getAddressesByUserId = async (userId) => {
  return await Address.find({ user: userId });
};

const createAddress = async (data) => {
  return await Address.create(data);
};

const updateAddress = async (id, data) => {
  return await Address.findByIdAndUpdate(id, data, { new: true });
};

const deleteAddress = async (id) => {
  return await Address.findByIdAndDelete(id);
};

module.exports = {
  getAllAddresses,
  getAddressById,
  getAddressesByUserId,
  createAddress,
  updateAddress,
  deleteAddress,
};
