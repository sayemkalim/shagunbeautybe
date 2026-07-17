const mongoose = require("mongoose");

const ContactFormSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const ContactForm = mongoose.model("Contactform", ContactFormSchema);
module.exports = ContactForm;