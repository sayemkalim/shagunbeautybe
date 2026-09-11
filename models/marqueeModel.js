const mongoose = require("mongoose");

const MarqueeSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

MarqueeSchema.index({ is_active: 1, order: 1 });

const Marquee = mongoose.model("Marquee", MarqueeSchema);
module.exports = Marquee;
