/** Blocks actions that need a contactable customer (bookings, instant puja, consultations) until a phone is verified. */
module.exports = (req, res, next) => {
  if (req.user && !req.user.phone) {
    return res.status(403).json({
      success: false,
      needsPhone: true,
      message: "Please verify your mobile number to continue",
    });
  }
  next();
};
