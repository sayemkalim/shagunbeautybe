require("dotenv").config();
const mongoose = require("mongoose");

const Admin = require("../models/adminModel");

/**
 * Creates a super admin and an admin using credentials from env vars.
 * Existing accounts with the same email are left untouched (skipped).
 *
 * Required env vars:
 *   MONGO_URI
 *   SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 */
async function seedAdmins() {
  const {
    MONGO_URI,
    SUPER_ADMIN_NAME,
    SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_PASSWORD,
    ADMIN_NAME,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
  } = process.env;

  const missing = [
    "MONGO_URI",
    "SUPER_ADMIN_NAME",
    "SUPER_ADMIN_EMAIL",
    "SUPER_ADMIN_PASSWORD",
    "ADMIN_NAME",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const accountsToCreate = [
    {
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      role: "super_admin",
    },
    {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
    },
  ];

  for (const account of accountsToCreate) {
    const exists = await Admin.findOne({ email: account.email });
    if (exists) {
      console.log(`Skipped: ${account.email} already exists`);
      continue;
    }

    const created = await Admin.create(account);
    console.log(`Created ${created.role}: ${created.email} (id: ${created.id})`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

seedAdmins().catch((err) => {
  console.error(err);
  process.exit(1);
});
