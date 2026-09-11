const Marquee = require("../../models/marqueeModel.js");

const getAllMarquees = async ({ skip, limit, is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await Marquee.find(filter)
    .sort({ order: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("created_by", "name email");
};

const countAllMarquees = async ({ is_active }) => {
  let filter = {};
  if (is_active !== undefined) {
    filter.is_active = is_active;
  }

  return await Marquee.countDocuments(filter);
};

const getActiveMarquees = async () => {
  return await Marquee.find({ is_active: true }).sort({
    order: 1,
    createdAt: -1,
  });
};

const getMarqueeById = async (id) => {
  return await Marquee.findById(id).populate("created_by", "name email");
};

const createMarquee = async (data) => {
  return await Marquee.create(data);
};

const updateMarquee = async (id, data) => {
  return await Marquee.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).populate("created_by", "name email");
};

const deleteMarquee = async (id) => {
  return await Marquee.findByIdAndDelete(id);
};

module.exports = {
  getAllMarquees,
  countAllMarquees,
  getActiveMarquees,
  getMarqueeById,
  createMarquee,
  updateMarquee,
  deleteMarquee,
};
