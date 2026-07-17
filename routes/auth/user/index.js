const express = require("express");
const {
  getAllUsers,
  registerUser,
  updateUser,
  deleteUser,
  loginUser,
  getUserById,
  forgotPassword,
  googleLogin,
  // logoutUser,
} = require("../../../controllers/auth/user/index");
const { superAdmin } = require("../../../middleware/auth/adminMiddleware");
const router = express.Router();

router.get("/", superAdmin, getAllUsers);
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", googleLogin); // Google OAuth login
router.post("/forgot-password", forgotPassword);
router.get("/:id", getUserById);
router.patch("/:id", updateUser);

// router.post("/logout", logoutUser);

// DEVELOPMENT API's
router.delete("/:id", deleteUser);

module.exports = router;
