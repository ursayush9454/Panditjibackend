/**
 * Creates the vendor earning + credits the vendor wallet when a booking completes.
 * Idempotent: calling twice for the same booking does nothing the second time.
 */
const Earning = require("../models/Earning");
const Vendor = require("../models/Vendor");
const { creditWallet, debitWallet } = require("./walletService");
const { notifyUser } = require("./notificationService");

const SERVICE_MAP = {
  pandit: "pandit",
  puja: "pandit",
  mandali: "mandali",
  merchant: "merchant",
  chat: "chat",
  audio: "audio",
  video: "video",
};

/**
 * Rules
 *  - cash booking     : vendor already holds the money. We record the earning and try to
 *                       debit the platform commission from the vendor wallet (best effort,
 *                       otherwise it is recorded as commissionDue).
 *  - online / wallet  : platform holds the money, so the vendor wallet is credited with the
 *                       net amount, but ONLY once paymentStatus === "paid".
 */
const settleBookingEarning = async (booking) => {
  const reference = `BOOKING-${booking._id}`;
  const isCash = booking.paymentMethod === "cash";

  if (!isCash && booking.paymentStatus !== "paid") {
    return { earning: null, duplicate: false, pendingPayment: true };
  }

  const existing = await Earning.findOne({ transactionReference: reference });
  if (existing) return { earning: existing, duplicate: true };

  const vendor = await Vendor.findById(booking.vendor).select("user name");
  if (!vendor) return { earning: null, duplicate: false };

  const gross = Number(booking.baseAmount || booking.amount || 0);
  if (gross <= 0) return { earning: null, duplicate: false };

  const net = Number(
    booking.vendorAmount !== undefined && booking.vendorAmount !== null
      ? booking.vendorAmount
      : gross - Number(booking.commissionAmount || 0)
  );

  let earning;
  try {
    earning = await Earning.create({
      vendor: vendor._id,
      user: vendor.user,
      booking: booking._id,
      serviceType: SERVICE_MAP[booking.serviceType] || "booking",
      grossAmount: gross,
      discountAmount: Number(booking.discountAmount || 0),
      platformFee: Number(booking.platformFee || 0),
      commissionPercentage: Number(booking.commissionPercentage || 0),
      commissionAmount: Number(booking.commissionAmount || 0),
      taxAmount: Number(booking.taxAmount || 0),
      netAmount: Math.max(0, net),
      status: "available",
      transactionReference: reference,
      creditedAt: new Date(),
      metadata: { settlement: isCash ? "cash_collected_by_vendor" : "platform_collected" },
    });
  } catch (e) {
    if (e.code === 11000) {
      return { earning: await Earning.findOne({ transactionReference: reference }), duplicate: true };
    }
    throw e;
  }

  if (isCash) {
    const due = Number(earning.commissionAmount || 0);
    if (due > 0) {
      try {
        await debitWallet({
          userId: vendor.user,
          amount: due,
          category: "commission",
          referenceId: `${reference}-COMMISSION`,
          booking: booking._id,
          earning: earning._id,
          description: "Platform commission on cash booking",
          createdBy: null,
        });
      } catch (e) {
        earning.metadata = { ...(earning.metadata || {}), commissionDue: due, commissionDueReason: e.message };
        earning.markModified("metadata");
        await earning.save();
      }
    }
  } else {
    await creditWallet({
      userId: vendor.user,
      amount: earning.netAmount,
      category: "earning",
      referenceId: reference,
      booking: booking._id,
      earning: earning._id,
      description: `Earning for booking ${booking.title || booking._id}`,
      createdBy: null,
    });
  }

  try {
    await notifyUser({
      userId: vendor.user,
      title: "Earning credited",
      message: `₹${earning.netAmount} added to your wallet.`,
      type: "earning_created",
      referenceId: earning._id,
      referenceType: "earning",
    });
  } catch (_) {
    /* notification failure must not break settlement */
  }

  return { earning, duplicate: false };
};

module.exports = { settleBookingEarning };
