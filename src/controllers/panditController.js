const mongoose = require("mongoose");

const Vendor = require("../models/Vendor");
const Slot = require("../models/Slot");
const Booking = require("../models/Booking");

const getPandit = async (userId) => {
  return Vendor.findOne({
    user: userId,
    role: "pandit",
  });
};

/*
  Create slot
*/
exports.createSlot = async (req, res) => {
  try {
    const {
      date,
      startTime,
      endTime,
      serviceType = "pandit",
      notes = "",
    } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "date, startTime and endTime are required",
      });
    }

    const pandit = await getPandit(req.user.id);

    if (!pandit) {
      return res.status(404).json({
        success: false,
        message: "Pandit profile not found",
      });
    }

    if (pandit.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Pandit is not approved yet",
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be greater than start time",
      });
    }

    const existingSlot = await Slot.findOne({
      vendor: pandit._id,
      date,
      startTime,
      endTime,
    });

    if (existingSlot) {
      return res.status(409).json({
        success: false,
        message: "Slot already exists",
        slot: existingSlot,
      });
    }

    const slot = await Slot.create({
      vendor: pandit._id,
      date,
      startTime,
      endTime,
      status: "available",
      serviceType,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: "Slot created successfully",
      slot,
    });
  } catch (error) {
    console.error("Create Slot Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create slot",
      error: error.message,
    });
  }
};

/*
  Get own slots
*/
exports.getSlots = async (req, res) => {
  try {
    const pandit = await getPandit(req.user.id);

    if (!pandit) {
      return res.status(404).json({
        success: false,
        message: "Pandit profile not found",
      });
    }

    const { date, status } = req.query;

    const filter = {
      vendor: pandit._id,
    };

    if (date) {
      filter.date = date;
    }

    if (status) {
      filter.status = status;
    }

    const slots = await Slot.find(filter).sort({
      date: 1,
      startTime: 1,
    });

    return res.json({
      success: true,
      count: slots.length,
      slots,
    });
  } catch (error) {
    console.error("Get Slots Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch slots",
    });
  }
};

/*
  Block slot
*/
exports.blockSlot = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID",
      });
    }

    const pandit = await getPandit(req.user.id);

    if (!pandit) {
      return res.status(404).json({
        success: false,
        message: "Pandit profile not found",
      });
    }

    const slot = await Slot.findOne({
      _id: id,
      vendor: pandit._id,
    });

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Slot not found",
      });
    }

    if (slot.status === "booked") {
      return res.status(400).json({
        success: false,
        message: "Booked slot cannot be blocked",
      });
    }

    slot.status = "blocked";

    await slot.save();

    return res.json({
      success: true,
      message: "Slot blocked successfully",
      slot,
    });
  } catch (error) {
    console.error("Block Slot Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to block slot",
    });
  }
};

/*
  Unblock slot
*/
exports.unblockSlot = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID",
      });
    }

    const pandit = await getPandit(req.user.id);

    if (!pandit) {
      return res.status(404).json({
        success: false,
        message: "Pandit profile not found",
      });
    }

    const slot = await Slot.findOne({
      _id: id,
      vendor: pandit._id,
    });

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Slot not found",
      });
    }

    if (slot.status === "booked") {
      return res.status(400).json({
        success: false,
        message: "Booked slot cannot be unblocked",
      });
    }

    slot.status = "available";

    await slot.save();

    return res.json({
      success: true,
      message: "Slot is now available",
      slot,
    });
  } catch (error) {
    console.error("Unblock Slot Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to unblock slot",
    });
  }
};

/*
  Delete slot
*/
exports.deleteSlot = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID",
      });
    }

    const pandit = await getPandit(req.user.id);

    if (!pandit) {
      return res.status(404).json({
        success: false,
        message: "Pandit profile not found",
      });
    }

    const slot = await Slot.findOne({
      _id: id,
      vendor: pandit._id,
    });

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Slot not found",
      });
    }

    if (slot.status === "booked") {
      return res.status(400).json({
        success: false,
        message: "Booked slot cannot be deleted",
      });
    }

    await Slot.deleteOne({
      _id: id,
    });

    return res.json({
      success: true,
      message: "Slot deleted successfully",
    });
  } catch (error) {
    console.error("Delete Slot Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete slot",
    });
  }
};

/*
  Customer books a Pandit slot
  Booking model is now the canonical booking record.
*/
exports.bookSlot = async (req, res) => {
  try {
    const {
      slotId,
      title = "Pandit Service Booking",
      description = "",
      address = "",
      notes = "",
      amount = 0,
    } = req.body;

    if (!slotId) {
      return res.status(400).json({
        success: false,
        message: "slotId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID",
      });
    }

    const customer = req.user;

    const slot = await Slot.findById(slotId).populate(
      "vendor",
      "name phone role status"
    );

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Slot not found",
      });
    }

    if (slot.status !== "available") {
      return res.status(400).json({
        success: false,
        message: "This slot is not available",
      });
    }

    if (!slot.vendor) {
      return res.status(404).json({
        success: false,
        message: "Pandit profile not found",
      });
    }

    if (slot.vendor.role !== "pandit") {
      return res.status(400).json({
        success: false,
        message: "Selected slot does not belong to a Pandit",
      });
    }

    if (slot.vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Pandit is not approved",
      });
    }

    /*
      Prevent customer from creating duplicate active
      booking for the same slot.
    */
    const existingBooking = await Booking.findOne({
      slot: slot._id,
      status: {
        $in: [
          "pending",
          "confirmed",
          "rescheduled",
          "in_progress",
        ],
      },
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "This slot has already been booked",
      });
    }

    /*
      Prevent same customer from double booking
      the same time slot with the same vendor.
    */
    const customerExistingBooking = await Booking.findOne({
      customer: customer.id,
      vendor: slot.vendor._id,
      scheduledDate: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: {
        $in: [
          "pending",
          "confirmed",
          "rescheduled",
          "in_progress",
        ],
      },
    });

    if (customerExistingBooking) {
      return res.status(409).json({
        success: false,
        message: "You already have a booking for this time",
        booking: customerExistingBooking,
      });
    }

    const booking = await Booking.create({
      customer: customer.id,
      vendor: slot.vendor._id,
      slot: slot._id,
      serviceType: "pandit",
      title,
      description,
      scheduledDate: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      address,
      notes,
      amount: Number(amount) || 0,
      status: "pending",
      paymentStatus: "pending",
    });

    /*
      Mark slot as booked and link booking.
    */
    slot.status = "booked";
    slot.bookingId = booking._id;
    slot.customer = customer.id;

    await slot.save();

    const populatedBooking = await Booking.findById(
      booking._id
    )
      .populate("vendor", "name phone role status")
      .populate(
        "customer",
        "name phone email role"
      )
      .populate("slot");

    return res.status(201).json({
      success: true,
      message: "Pandit slot booked successfully",
      booking: populatedBooking,
    });
  } catch (error) {
    console.error("Book Slot Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to book slot",
      error: error.message,
    });
  }
};

/*
  Customer cancels Pandit booking
*/
exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId, reason = "" } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      customer: req.user.id,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (
      ![
        "pending",
        "confirmed",
        "rescheduled",
      ].includes(booking.status)
    ) {
      return res.status(400).json({
        success: false,
        message: `Booking cannot be cancelled from ${booking.status} status`,
      });
    }

    booking.status = "cancelled";
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();

    await booking.save();

    /*
      Release linked slot.
    */
    if (booking.slot) {
      await Slot.findOneAndUpdate(
        {
          _id: booking.slot,
          bookingId: booking._id,
        },
        {
          $set: {
            status: "available",
            bookingId: null,
            customer: null,
          },
        }
      );
    }

    const updatedBooking = await Booking.findById(
      booking._id
    )
      .populate("vendor", "name phone role status")
      .populate(
        "customer",
        "name phone email role"
      )
      .populate("slot");

    return res.json({
      success: true,
      message: "Booking cancelled successfully",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Cancel Booking Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message,
    });
  }
};