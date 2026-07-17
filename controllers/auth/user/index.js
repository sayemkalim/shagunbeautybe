const { asyncHandler } = require("../../../common/asyncHandler");
const User = require("../../../models/userModel");
const ApiResponse = require("../../../utils/ApiResponse");
const { generateAccessToken } = require("../../../utils/auth");
const { sendWelcomeEmail } = require("../../../utils/email/directEmailService");
const { OAuth2Client } = require("google-auth-library");

const PIN_REGEX = /^\d{4}$/;
const MAX_PIN_ATTEMPTS = 10;
const PIN_ATTEMPTS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const getAllUsers = asyncHandler(async (req, res) => {
  const superAdminId = req.admin._id;

  if (!superAdminId) {
    return res.json(new ApiResponse(404, null, "Not authorized"));
  }

  const { search, page, per_page = 50 } = req.query;

  const filters = {
    ...(search && {
      name: { $regex: search, $options: "i" },
      email: { $regex: search, $options: "i" },
    }),
  };

  const skip = (page - 1) * per_page;

  const users = await User.find(filters)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(per_page)
    .select("-pin");

  res.json(new ApiResponse(200, users, "Users fetched successfully", true));
});

/**
 * Step 1 of login/register: client sends only phoneNumber.
 * - Existing, fully-registered user (has a pin) -> is_new_user: false, client should call /verify-login next.
 * - Unknown phone, or a phone with an incomplete signup (no pin yet) -> stub user is created/reused,
 *   is_new_user: true, client should call /register next.
 */
const loginUser = asyncHandler(async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Phone number is required", false));
  }

  let user = await User.findOne({ phone: phoneNumber });
  const isNewUser = !user || !user.pin;

  if (!user) {
    user = await User.create({ phone: phoneNumber });
  }

  res.json(
    new ApiResponse(
      200,
      { is_new_user: isNewUser },
      isNewUser ? "New user, please complete registration" : "Enter your PIN to continue",
      true
    )
  );
});

/**
 * Step 2 (existing users): verify the 4-digit PIN for a phone that already completed registration.
 * Rate-limited to MAX_PIN_ATTEMPTS wrong attempts per rolling PIN_ATTEMPTS_WINDOW_MS window.
 */
const verifyLogin = asyncHandler(async (req, res) => {
  const { phoneNumber, pin } = req.body;

  if (!phoneNumber || !pin) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Phone number and pin are required", false));
  }

  const user = await User.findOne({ phone: phoneNumber });

  if (!user || !user.pin) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "User not found. Please register first.", false));
  }

  const now = new Date();
  const windowExpired =
    !user.pinAttemptsWindowStart ||
    now - user.pinAttemptsWindowStart > PIN_ATTEMPTS_WINDOW_MS;

  if (windowExpired) {
    user.pinAttempts = 0;
    user.pinAttemptsWindowStart = now;
  }

  if (user.pinAttempts >= MAX_PIN_ATTEMPTS) {
    return res
      .status(429)
      .json(
        new ApiResponse(
          429,
          null,
          "Too many incorrect attempts. Please try again in an hour.",
          false
        )
      );
  }

  const isMatch = await user.matchPin(pin);

  if (!isMatch) {
    user.pinAttempts += 1;
    await user.save();
    return res
      .status(401)
      .json(new ApiResponse(401, null, "Invalid PIN", false));
  }

  user.pinAttempts = 0;
  user.pinAttemptsWindowStart = null;
  await user.save();

  const accessToken = generateAccessToken(user._id);

  const data = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    token: accessToken,
  };

  res.json(new ApiResponse(200, data, "Login successful", true));
});

/**
 * Step 2 (new users, called after /login returned is_new_user: true): sets the PIN
 * (and optional name/email) on the stub user created by /login, completing registration.
 */
const registerUser = asyncHandler(async (req, res) => {
  const { phoneNumber, pin, name, email } = req.body;

  if (!phoneNumber || !pin) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Phone number and pin are required", false));
  }

  if (!PIN_REGEX.test(pin)) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Pin must be exactly 4 digits", false));
  }

  let user = await User.findOne({ phone: phoneNumber });

  if (user && user.pin) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "User already registered. Please login.", false));
  }

  if (email) {
    const emailExists = await User.findOne({
      email,
      ...(user && { _id: { $ne: user._id } }),
    });
    if (emailExists) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email already exists", false));
    }
  }

  if (!user) {
    user = new User({ phone: phoneNumber });
  }

  user.pin = pin;
  if (name) user.name = name;
  if (email) user.email = email;

  await user.save();

  if (email) {
    // Send welcome email asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await sendWelcomeEmail({
          user: user.toObject(),
        });
      } catch (error) {
        console.error("❌ Failed to send welcome email:", error.message);
      }
    });
  }

  const accessToken = generateAccessToken(user._id);

  const data = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    token: accessToken,
  };

  res.json(new ApiResponse(201, data, "Registration successful", true));
});

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;

  const user = await User.findById(id);
  if (!user) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "User not found", false));
  }

  if (name) user.name = name;
  if (email) user.email = email;
  if (phone) user.phone = phone;

  await user.save();
  const updatedUser = await User.findById(id).select("-pin");

  res.json(
    new ApiResponse(200, updatedUser, "User updated successfully", true)
  );
});

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "User not found", false));
  }

  await user.deleteOne();

  res.json(new ApiResponse(200, null, "User deleted successfully", true));
});

const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select("-pin");
  if (!user) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "User not found", false));
  }

  res.json(new ApiResponse(200, user, "User fetched successfully", true));
});

/**
 * Google OAuth Login
 * Verifies Google ID token and creates/logs in user
 */
const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res
      .status(400)
      .json(new ApiResponse(400, null, "Google ID token is required", false));
  }

  try {
    // Initialize Google OAuth client
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Email not provided by Google", false));
    }

    // Check if user exists with this Google ID
    let user = await User.findOne({ googleId });

    if (!user) {
      // Check if user exists with this email (might have registered with email/password)
      user = await User.findOne({ email });

      if (user) {
        // Link Google account to existing user
        user.googleId = googleId;
        user.authProvider = user.authProvider === "local" ? "local" : "google";
        if (picture && !user.profilePicture) {
          user.profilePicture = picture;
        }
        await user.save();
      } else {
        // Create new user with Google account
        // Note: Don't include 'phone' field at all - let it be undefined
        // This allows multiple Google users without triggering unique constraint
        user = await User.create({
          name,
          email,
          googleId,
          authProvider: "google",
          profilePicture: picture,
        });

        // Send welcome email asynchronously (non-blocking)
        setImmediate(async () => {
          try {
            await sendWelcomeEmail({
              user: user.toObject(),
            });
          } catch (error) {
            console.error("❌ Failed to send welcome email:", error.message);
          }
        });
      }
    } else {
      // Update profile picture if changed
      if (picture && user.profilePicture !== picture) {
        user.profilePicture = picture;
        await user.save();
      }
    }

    const accessToken = generateAccessToken(user._id);

    const data = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      profilePicture: user.profilePicture,
      authProvider: user.authProvider,
      token: accessToken,
    };

    res.json(new ApiResponse(200, data, "Google login successful", true));
  } catch (error) {
    console.error("Google login error:", error);
    console.error("Error details:", error.message);
    console.error("Stack trace:", error.stack);

    if (error.message.includes("Token used too late") || error.message.includes("Invalid token")) {
      return res
        .status(401)
        .json(new ApiResponse(401, null, "Invalid or expired Google token", false));
    }

    // Return specific error message for debugging
    return res
      .status(500)
      .json(new ApiResponse(500, null, error.message || "Google authentication failed", false));
  }
});

module.exports = {
  getAllUsers,
  registerUser,
  loginUser,
  verifyLogin,
  updateUser,
  deleteUser,
  getUserById,
  googleLogin,
};
