require("dotenv").config();

const emailConfig = {
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === "true" || false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  from: {
    name: process.env.EMAIL_FROM_NAME || "Celiac Store",
    email: process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER,
  },
};

module.exports = emailConfig;
