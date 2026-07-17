const jwt = require("jsonwebtoken");

// Generate access token (no expiry)
const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET);
};

// Generate refresh token (no expiry)
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET);
};

const sendRefreshToken = (res, token) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/refresh",
    // No maxAge - cookie won't expire
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  sendRefreshToken,
};
