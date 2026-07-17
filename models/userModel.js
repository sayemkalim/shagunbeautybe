const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: {
      type: String,
      required: false, // Optional — collected at registration, not required
      unique: true,
      sparse: true // Allows multiple users with no email
    },
    phone: {
      type: String,
      required: false, // Not required at the schema level so Google-only users (no phone) still work
      unique: true,
      sparse: true // Allows multiple null values for Google users without phone
    },
    pin: { type: String, required: false }, // 4-digit login PIN, bcrypt-hashed. Absent = registration not completed yet.
    pinAttempts: { type: Number, default: 0 },
    pinAttemptsWindowStart: { type: Date, default: null }, // start of the current 1-hour PIN-attempt window
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

// Hash pin before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("pin") || !this.pin) return next();
  this.pin = await bcrypt.hash(this.pin, 10);
  next();
});

// Compare PIN method
UserSchema.methods.matchPin = async function (enteredPin) {
  if (!this.pin) return false;
  return await bcrypt.compare(enteredPin, this.pin);
};

const User = mongoose.model("User", UserSchema);
module.exports = User;
