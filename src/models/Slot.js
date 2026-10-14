const mongoose = require("mongoose");

const slotSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    date: {
      type: String,
      required: true,
      trim: true,
    },

    startTime: {
      type: String,
      required: true,
      trim: true,
    },

    endTime: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "available",
        "booked",
        "blocked",
      ],
      default: "available",
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    serviceType: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

slotSchema.index({
  vendor: 1,
  date: 1,
  startTime: 1,
  endTime: 1,
});

slotSchema.index({
  vendor: 1,
  date: 1,
  status: 1,
});

module.exports = mongoose.model(
  "Slot",
  slotSchema
);