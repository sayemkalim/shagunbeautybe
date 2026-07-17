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
  // logoutUser,
} = require("../../../controllers/auth/user/index");
const { superAdmin } = require("../../../middleware/auth/adminMiddleware");
const router = express.Router();

router.get("/", superAdmin, getAllUsers);
router.post("/login", loginUser); // Step 1: phoneNumber -> { is_new_user }
router.post("/verify-login", verifyLogin); // Step 2 (existing user): phoneNumber + pin -> token
router.post("/register", registerUser); // Step 2 (new user): phoneNumber + pin + name?/email? -> token
router.post("/google", googleLogin); // Google OAuth login
router.get("/:id", getUserById);
router.patch("/:id", updateUser);

// router.post("/logout", logoutUser);

// DEVELOPMENT API's
router.delete("/:id", deleteUser);

module.exports = router;
