const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const AdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["super_admin", "admin", "sub_admin"],
      default: "admin",
    },
    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Services",
      },
    ],
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: function () {
        return this.role === "sub_admin";
      },
      validate: {
        validator: function (value) {
          // Allow created_by only if role is sub_admin
          return this.role === "sub_admin" || value == null;
        },
        message: "created_by is only allowed for sub_admin role",
      },
    },
  },
  { timestamps: true }
);

// Hash password before saving
AdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
AdminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Admin = mongoose.model("Admin", AdminSchema);
module.exports = Admin;
