const jwt = require("jsonwebtoken");
const User = require("../../models/userModel");
const ApiResponse = require("../../utils/ApiResponse");

const authenticateRole = () => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Unauthorized", false));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res
        .status(403)
        .json(new ApiResponse(403, null, "Access denied", false));
    }

    req.user = user;
    next();
  } catch (error) {
    res
      .status(403)
      .json(new ApiResponse(403, null, "Invalid or expired token", false));
  }
};

module.exports = {
  user: authenticateRole(),
};
