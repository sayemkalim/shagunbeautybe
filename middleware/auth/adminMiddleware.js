const jwt = require("jsonwebtoken");
const Admin = require("../../models/adminModel");
const ApiResponse = require("../../utils/ApiResponse");

const authenticateRole =
  (allowedRoles = []) =>
  async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];

      if (!token) {
        return res
          .status(401)
          .json(new ApiResponse(401, null, "Unauthorized", false));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const admin = await Admin.findById(decoded.id).select("-password");

      if (!admin || !allowedRoles.includes(admin.role)) {
        return res
          .status(403)
          .json(new ApiResponse(403, null, "Access denied", false));
      }

      req.admin = admin;
      next();
    } catch (error) {
      res
        .status(403)
        .json(new ApiResponse(403, null, "Invalid or expired token", false));
    }
  };

// Role-based authentication middlewares
module.exports = {
  superAdmin: authenticateRole(["super_admin"]),
  admin: authenticateRole(["admin"]),
  subAdmin: authenticateRole(["sub_admin"]),
  adminOrSubAdmin: authenticateRole(["admin", "sub_admin"]),
  adminOrSuperAdmin: authenticateRole(["admin", "super_admin"]),
  adminOrSubAdminOrSuperAdmin: authenticateRole([
    "admin",
    "sub_admin",
    "super_admin",
  ]),
};
