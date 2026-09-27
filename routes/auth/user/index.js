const express = require("express");
const {
  getAllUsers,
  registerUser,
  updateUser,
  deleteUser,
  loginUser,
  verifyLogin,
  getUserById,
  googleLogin,
  forgotPin,
  verifyResetOtp,
  resetPin,
  // logoutUser,
} = require("../../../controllers/auth/user/index");
const { superAdmin } = require("../../../middleware/auth/adminMiddleware");
const router = express.Router();

router.get("/", superAdmin, getAllUsers);
router.post("/login", loginUser); // Step 1: phoneNumber -> { is_new_user }
router.post("/verify-login", verifyLogin); // Step 2 (existing user): phoneNumber + pin -> token
router.post("/register", registerUser); // Step 2 (new user): phoneNumber + pin + name?/email? -> token
router.post("/google", googleLogin); // Google OAuth login

// Forgot PIN / Password flow
router.post("/forgot-pin", forgotPin); // Request OTP to registered email
router.post("/forgot-password", forgotPin); // Alias for compatibility
router.post("/verify-reset-otp", verifyResetOtp); // Verify OTP -> resetToken
router.post("/reset-pin", resetPin); // Update PIN with OTP or resetToken
router.post("/reset-password", resetPin); // Alias for compatibility

router.get("/:id", getUserById);
router.patch("/:id", updateUser);

// router.post("/logout", logoutUser);

// DEVELOPMENT API's
router.delete("/:id", deleteUser);

module.exports = router;
