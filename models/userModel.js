const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false }, // Optional for Google OAuth users
    phone: {
      type: String,
      required: false,
      unique: true,
      sparse: true // Allows multiple null values for Google users without phone
    },
    // Google OAuth fields
    googleId: { type: String, unique: true, sparse: true },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },
    profilePicture: { type: String, default: null },
  },
  { timestamps: true }
);

// Hash password before saving (only for local auth)
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
UserSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false; // Google users don't have passwords
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", UserSchema);
module.exports = User;
