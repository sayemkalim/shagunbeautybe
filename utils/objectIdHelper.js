const mongoose = require("mongoose");

/**
 * Convert string IDs to ObjectIds for proper MongoDB matching
 * @param {string|string[]} ids - Single ID or array of IDs
 * @returns {ObjectId|ObjectId[]} Converted ObjectId(s)
 */
const convertToObjectIds = (ids) => {
  if (!ids) return undefined;
  
  if (Array.isArray(ids)) {
    return ids.map(id => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
      }
      return id;
    });
  } else {
    if (mongoose.Types.ObjectId.isValid(ids)) {
      return new mongoose.Types.ObjectId(ids);
    }
    return ids;
  }
};

module.exports = {
  convertToObjectIds
};
