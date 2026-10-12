// const mongoose = require("mongoose");

// const Booking = require("../models/Booking");
// const Slot = require("../models/Slot");
// const Vendor = require("../models/Vendor");
// const Puja = require("../models/Puja");
// const PanditPujaService = require("../models/PanditPujaService");
// const Product = require("../models/Product");
// const {
//   notifyBookingCreated,
//   notifyBookingAccepted,
//   notifyBookingRejected,
//   notifyBookingCancelled,
//   notifyBookingRescheduled,
//   notifyBookingStarted,
//   notifyBookingCompleted,
//   notifyBookingNoShow,
// } = require("../services/notificationService");

// // ======================================================
// // HELPERS
// // ======================================================

// const isValidObjectId = (id) => {
//   return mongoose.Types.ObjectId.isValid(id);
// };

// const generateOtp = () => {
//   return Math.floor(100000 + Math.random() * 900000).toString();
// };

// const getVendorForUser = async (userId) => {
//   return Vendor.findOne({ user: userId });
// };

// const normalizeSamagriOption = (value) => {
//   const allowed = [
//     "without_samagri",
//     "with_samagri",
//     "self_arranged",
//   ];

//   if (!value) {
//     return "without_samagri";
//   }

//   return allowed.includes(value)
//     ? value
//     : "without_samagri";
// };

// // ======================================================
// // PRICING
// // ======================================================

// const calculatePricing = ({
//   pujaBasePrice = 0,
//   panditServicePrice = 0,
//   samagriTotal = 0,
//   discount = 0,
//   tax = 0,
//   platformFee = 0,
// }) => {
//   const pujaTotal = Number(pujaBasePrice || 0);
//   const panditTotal = Number(panditServicePrice || 0);
//   const samagriAmount = Number(samagriTotal || 0);

//   const subtotal =
//     pujaTotal +
//     panditTotal +
//     samagriAmount;

//   const discountAmount = Math.max(
//     0,
//     Number(discount || 0)
//   );

//   const taxAmount = Math.max(
//     0,
//     Number(tax || 0)
//   );

//   const platformFeeAmount = Math.max(
//     0,
//     Number(platformFee || 0)
//   );

//   const total =
//     subtotal -
//     discountAmount +
//     taxAmount +
//     platformFeeAmount;

//   return {
//     pujaTotal,
//     panditTotal,
//     samagriTotal: samagriAmount,
//     subtotal,
//     discount: discountAmount,
//     tax: taxAmount,
//     platformFee: platformFeeAmount,
//     total: Math.max(0, total),
//   };
// };

// // ======================================================
// // SLOT HELPERS
// // ======================================================

// const releaseSlot = async (slotId) => {
//   if (!slotId || !isValidObjectId(slotId)) {
//     return;
//   }

//   await Slot.findByIdAndUpdate(
//     slotId,
//     {
//       $set: {
//         isBooked: false,
//         booking: null,
//       },
//     }
//   );
// };

// const bookSlot = async (slotId, bookingId) => {
//   if (!slotId || !isValidObjectId(slotId)) {
//     return null;
//   }

//   return Slot.findOneAndUpdate(
//     {
//       _id: slotId,
//       isBooked: { $ne: true },
//       isBlocked: { $ne: true },
//     },
//     {
//       $set: {
//         isBooked: true,
//         booking: bookingId,
//       },
//     },
//     {
//       new: true,
//     }
//   );
// };

// // ======================================================
// // PUJA BOOKING DATA
// // ======================================================

// const getPujaBookingData = async ({
//   vendor,
//   serviceType,
//   pujaId,
//   panditPujaServiceId,
//   samagriOption,
// }) => {
//   if (serviceType !== "pandit") {
//     return {
//       puja: null,
//       pujaName: "",
//       pujaCategory: "",
//       pujaBasePrice: 0,
//       pujaDurationMinutes: 0,
//       panditPujaService: null,
//       panditServicePrice: 0,
//       samagriProducts: [],
//       samagriTotal: 0,
//       samagriComboPrice: 0,
//     };
//   }

//   if (!pujaId) {
//     throw new Error(
//       "pujaId is required for pandit booking"
//     );
//   }

//   if (!isValidObjectId(pujaId)) {
//     throw new Error("Invalid pujaId");
//   }

//   const puja = await Puja.findOne({
//     _id: pujaId,
//     isActive: true,
//   }).lean();

//   if (!puja) {
//     throw new Error(
//       "Puja not found or inactive"
//     );
//   }

//   let panditPujaService = null;

//   if (panditPujaServiceId) {
//     if (!isValidObjectId(panditPujaServiceId)) {
//       throw new Error(
//         "Invalid panditPujaServiceId"
//       );
//     }

//     panditPujaService =
//       await PanditPujaService.findOne({
//         _id: panditPujaServiceId,
//         pandit: vendor._id,
//         puja: puja._id,
//         isActive: true,
//       }).lean();
//   } else {
//     panditPujaService =
//       await PanditPujaService.findOne({
//         pandit: vendor._id,
//         puja: puja._id,
//         isActive: true,
//       }).lean();
//   }

//   if (!panditPujaService) {
//     throw new Error(
//       "Selected Pandit does not offer this Puja"
//     );
//   }

//   const normalizedSamagriOption =
//     normalizeSamagriOption(
//       samagriOption
//     );

//   let samagriProducts = [];
//   let samagriTotal = 0;
//   let samagriComboPrice = 0;

//   if (
//     normalizedSamagriOption ===
//     "with_samagri"
//   ) {
//     if (!puja.samagriAvailable) {
//       throw new Error(
//         "Samagri is not available for this Puja"
//       );
//     }

//     samagriComboPrice = Number(
//       puja.samagriComboPrice || 0
//     );

//     if (
//       Array.isArray(puja.samagriProducts) &&
//       puja.samagriProducts.length
//     ) {
//       const productIds =
//         puja.samagriProducts.filter(
//           (id) => isValidObjectId(id)
//         );

//       if (productIds.length) {
//         const products =
//           await Product.find({
//             _id: { $in: productIds },
//             isActive: true,
//           })
//             .select(
//               "_id name price image stock isActive"
//             )
//             .lean();

//         samagriProducts = products.map(
//           (product) => ({
//             product: product._id,
//             name: product.name || "",
//             quantity: 1,
//             price: Number(
//               product.price || 0
//             ),
//             image: product.image || "",
//           })
//         );
//       }
//     }

//     if (samagriComboPrice > 0) {
//       samagriTotal = samagriComboPrice;
//     } else {
//       samagriTotal =
//         samagriProducts.reduce(
//           (sum, item) =>
//             sum +
//             Number(item.price || 0) *
//               Number(item.quantity || 1),
//           0
//         );
//     }
//   }

//   return {
//     puja: puja._id,
//     pujaName: puja.name || "",
//     pujaCategory: puja.category || "",
//     pujaBasePrice: Number(
//       puja.basePrice || 0
//     ),
//     pujaDurationMinutes: Number(
//       puja.durationMinutes || 0
//     ),

//     panditPujaService:
//       panditPujaService._id,

//     panditServicePrice: Number(
//       panditPujaService.price || 0
//     ),

//     samagriProducts,
//     samagriTotal,
//     samagriComboPrice,
//   };
// };

// // ======================================================
// // CREATE BOOKING
// // ======================================================

// exports.createBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const userId = req.user.id;

//     const {
//       vendorId,
//       slotId,
//       serviceType,
//       bookingDate,
//       startTime,
//       endTime,
//       notes,
//       address,
//       city,
//       state,
//       pincode,
//       latitude,
//       longitude,

//       // Puja
//       pujaId,
//       panditPujaServiceId,
//       samagriOption,

//       // Optional pricing
//       discount,
//       tax,
//       platformFee,
//     } = req.body;

//     // --------------------------------------------------
//     // BASIC VALIDATION
//     // --------------------------------------------------

//     if (!vendorId) {
//       return res.status(400).json({
//         success: false,
//         message: "vendorId is required",
//       });
//     }

//     if (!isValidObjectId(vendorId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid vendorId",
//       });
//     }

//     if (!serviceType) {
//       return res.status(400).json({
//         success: false,
//         message: "serviceType is required",
//       });
//     }

//     const allowedServiceTypes = [
//       "astrologer",
//       "pandit",
//       "merchant",
//       "mandali",
//     ];

//     if (
//       !allowedServiceTypes.includes(
//         serviceType
//       )
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid serviceType",
//       });
//     }

//     // --------------------------------------------------
//     // VENDOR
//     // --------------------------------------------------

//     const vendor =
//       await Vendor.findById(vendorId);

//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message: "Vendor not found",
//       });
//     }

//     if (vendor.status !== "approved") {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Vendor is not approved",
//       });
//     }

//     if (
//       vendor.role !== serviceType
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Vendor role does not match serviceType",
//       });
//     }

//     // --------------------------------------------------
//     // PUJA DATA
//     // --------------------------------------------------

//     const finalSamagriOption =
//       normalizeSamagriOption(
//         samagriOption
//       );

//     let pujaData = {
//       puja: null,
//       pujaName: "",
//       pujaCategory: "",
//       pujaBasePrice: 0,
//       pujaDurationMinutes: 0,
//       panditPujaService: null,
//       panditServicePrice: 0,
//       samagriProducts: [],
//       samagriTotal: 0,
//       samagriComboPrice: 0,
//     };

//     if (
//       serviceType === "pandit"
//     ) {
//       pujaData =
//         await getPujaBookingData({
//           vendor,
//           serviceType,
//           pujaId,
//           panditPujaServiceId,
//           samagriOption:
//             finalSamagriOption,
//         });
//     }

//     // --------------------------------------------------
//     // SLOT
//     // --------------------------------------------------

//     let slot = null;

//     if (slotId) {
//       if (!isValidObjectId(slotId)) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid slotId",
//         });
//       }

//       slot =
//         await Slot.findOne({
//           _id: slotId,
//           vendor: vendor._id,
//         });

//       if (!slot) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Slot not found for this vendor",
//         });
//       }

//       if (slot.isBlocked) {
//         return res.status(400).json({
//           success: false,
//           message: "Slot is blocked",
//         });
//       }

//       if (slot.isBooked) {
//         return res.status(400).json({
//           success: false,
//           message: "Slot is already booked",
//         });
//       }
//     }

//     // --------------------------------------------------
//     // DATE / TIME
//     // --------------------------------------------------

//     const finalBookingDate =
//       bookingDate ||
//       (slot ? slot.date : null);

//     const finalStartTime =
//       startTime ||
//       (slot ? slot.startTime : "");

//     const finalEndTime =
//       endTime ||
//       (slot ? slot.endTime : "");

//     if (!finalBookingDate) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "bookingDate is required",
//       });
//     }

//     if (!finalStartTime) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "startTime is required",
//       });
//     }

//     if (!finalEndTime) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "endTime is required",
//       });
//     }

//     // --------------------------------------------------
//     // PRICING
//     // --------------------------------------------------

//     const pricing =
//       calculatePricing({
//         pujaBasePrice:
//           pujaData.pujaBasePrice,

//         panditServicePrice:
//           pujaData.panditServicePrice,

//         samagriTotal:
//           pujaData.samagriTotal,

//         discount,
//         tax,
//         platformFee,
//       });

//     // --------------------------------------------------
//     // BOOKING PAYLOAD
//     // --------------------------------------------------

//     const bookingPayload = {
//       customer: userId,
//       vendor: vendor._id,

//       serviceType,

//       slot: slot
//         ? slot._id
//         : null,

//       bookingDate:
//         finalBookingDate,

//       startTime:
//         finalStartTime,

//       endTime:
//         finalEndTime,

//       notes: notes || "",

//       address: address || "",
//       city: city || "",
//       state: state || "",
//       pincode: pincode || "",

//       latitude:
//         latitude !== undefined
//           ? Number(latitude)
//           : null,

//       longitude:
//         longitude !== undefined
//           ? Number(longitude)
//           : null,

//       // ------------------------------------------------
//       // PUJA SNAPSHOT
//       // ------------------------------------------------

//       puja:
//         pujaData.puja,

//       pujaName:
//         pujaData.pujaName,

//       pujaCategory:
//         pujaData.pujaCategory,

//       pujaBasePrice:
//         pujaData.pujaBasePrice,

//       pujaDurationMinutes:
//         pujaData.pujaDurationMinutes,

//       // ------------------------------------------------
//       // PANDIT PUJA SERVICE
//       // ------------------------------------------------

//       panditPujaService:
//         pujaData.panditPujaService,

//       panditServicePrice:
//         pujaData.panditServicePrice,

//       // ------------------------------------------------
//       // SAMAGRI
//       // ------------------------------------------------

//       samagriOption:
//         serviceType === "pandit"
//           ? finalSamagriOption
//           : "without_samagri",

//       samagriIncluded:
//         serviceType === "pandit" &&
//         finalSamagriOption ===
//           "with_samagri",

//       samagriComboPrice:
//         pujaData.samagriComboPrice,

//       samagriProducts:
//         pujaData.samagriProducts,

//       // ------------------------------------------------
//       // TOTALS
//       // ------------------------------------------------

//       pujaTotal:
//         pricing.pujaTotal,

//       samagriTotal:
//         pricing.samagriTotal,

//       panditTotal:
//         pricing.panditTotal,

//       subtotal:
//         pricing.subtotal,

//       discount:
//         pricing.discount,

//       tax:
//         pricing.tax,

//       platformFee:
//         pricing.platformFee,

//       totalAmount:
//         pricing.total,

//       amount:
//         pricing.total,

//       status: "pending",

//       paymentStatus: "pending",
//     };

//     // --------------------------------------------------
//     // CREATE BOOKING
//     // --------------------------------------------------

//     const booking =
//       await Booking.create(
//         bookingPayload
//       );

//     // --------------------------------------------------
//     // LOCK SLOT
//     // --------------------------------------------------

//     if (slot) {
//       const lockedSlot =
//         await bookSlot(
//           slot._id,
//           booking._id
//         );

//       if (!lockedSlot) {
//         await Booking.findByIdAndDelete(
//           booking._id
//         );

//         return res.status(409).json({
//           success: false,
//           message:
//             "Slot was booked by another user",
//         });
//       }
//     }

//     const populatedBooking =
//       await Booking.findById(
//         booking._id
//       )
//         .populate(
//           "vendor",
//           "name email phone role city state profileImage"
//         )
//         .populate(
//           "slot"
//         )
//         .populate(
//           "puja",
//           "name slug description category basePrice durationMinutes image samagriAvailable samagriComboPrice"
//         );

//     return res.status(201).json({
//       success: true,
//       message:
//         "Booking created successfully",
//       booking:
//         populatedBooking,
//     });
//   } catch (error) {
//     console.error(
//       "Create booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         error.message ||
//         "Failed to create booking",
//     });
//   }
// };

// // ======================================================
// // MY BOOKINGS
// // ======================================================

// exports.getMyBookings = async (
//   req,
//   res
// ) => {
//   try {
//     const {
//       status,
//       serviceType,
//       page = 1,
//       limit = 20,
//     } = req.query;

//     const filter = {
//       customer: req.user.id,
//     };

//     if (status) {
//       filter.status = status;
//     }

//     if (serviceType) {
//       filter.serviceType =
//         serviceType;
//     }

//     const skip =
//       (Number(page) - 1) *
//       Number(limit);

//     const [
//       bookings,
//       total,
//     ] = await Promise.all([
//       Booking.find(filter)
//         .populate(
//           "vendor",
//           "name role city state profileImage chatRate audioRate videoRate"
//         )
//         .populate(
//           "slot"
//         )
//         .populate(
//           "puja",
//           "name slug category basePrice durationMinutes image"
//         )
//         .sort({
//           createdAt: -1,
//         })
//         .skip(skip)
//         .limit(Number(limit)),

//       Booking.countDocuments(
//         filter
//       ),
//     ]);

//     return res.json({
//       success: true,
//       bookings,
//       pagination: {
//         page: Number(page),
//         limit: Number(limit),
//         total,
//         pages: Math.ceil(
//           total / Number(limit)
//         ),
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Get my bookings error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to fetch bookings",
//     });
//   }
// };

// // ======================================================
// // VENDOR BOOKINGS
// // ======================================================

// exports.getVendorBookings = async (
//   req,
//   res
// ) => {
//   try {
//     const vendor =
//       await getVendorForUser(
//         req.user.id
//       );

//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Vendor profile not found",
//       });
//     }

//     const {
//       status,
//       serviceType,
//       page = 1,
//       limit = 20,
//     } = req.query;

//     const filter = {
//       vendor: vendor._id,
//     };

//     if (status) {
//       filter.status = status;
//     }

//     if (serviceType) {
//       filter.serviceType =
//         serviceType;
//     }

//     const skip =
//       (Number(page) - 1) *
//       Number(limit);

//     const [
//       bookings,
//       total,
//     ] = await Promise.all([
//       Booking.find(filter)
//         .populate(
//           "customer",
//           "name phone email profileImage"
//         )
//         .populate(
//           "slot"
//         )
//         .populate(
//           "puja",
//           "name slug category basePrice durationMinutes image"
//         )
//         .sort({
//           createdAt: -1,
//         })
//         .skip(skip)
//         .limit(Number(limit)),

//       Booking.countDocuments(
//         filter
//       ),
//     ]);

//     return res.json({
//       success: true,
//       bookings,
//       pagination: {
//         page: Number(page),
//         limit: Number(limit),
//         total,
//         pages: Math.ceil(
//           total / Number(limit)
//         ),
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Get vendor bookings error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to fetch vendor bookings",
//     });
//   }
// };

// // ======================================================
// // GET SINGLE BOOKING
// // ======================================================

// exports.getBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const { id } = req.params;

//     if (!isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid booking id",
//       });
//     }

//     const booking =
//       await Booking.findById(id)
//         .populate(
//           "customer",
//           "name phone email profileImage"
//         )
//         .populate(
//           "vendor",
//           "name email phone role city state profileImage chatRate audioRate videoRate"
//         )
//         .populate("slot")
//         .populate(
//           "puja",
//           "name slug description benefits category basePrice durationMinutes image samagriAvailable samagriComboPrice samagriTitle samagriDescription"
//         );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     const isCustomer =
//       String(
//         booking.customer?._id
//       ) === String(req.user.id);

//     const vendor =
//       await Vendor.findOne({
//         user: req.user.id,
//       }).select("_id");

//     const isVendor =
//       vendor &&
//       String(vendor._id) ===
//         String(booking.vendor?._id);

//     const isAdmin =
//       req.user.role === "admin";

//     if (
//       !isCustomer &&
//       !isVendor &&
//       !isAdmin
//     ) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied",
//       });
//     }

//     return res.json({
//       success: true,
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Get booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to fetch booking",
//     });
//   }
// };

// // ======================================================
// // CONFIRM BOOKING
// // ======================================================

// exports.confirmBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const vendor =
//       await getVendorForUser(
//         req.user.id
//       );

//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Vendor profile not found",
//       });
//     }

//     const booking =
//       await Booking.findOne({
//         _id: req.params.id,
//         vendor: vendor._id,
//       });

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     if (
//       booking.status !== "pending"
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           `Booking cannot be confirmed from ${booking.status} status`,
//       });
//     }

//     booking.status = "confirmed";

//     if (
//       booking.confirmedAt !==
//       undefined
//     ) {
//       booking.confirmedAt =
//         new Date();
//     }

//     await booking.save();

//     return res.json({
//       success: true,
//       message:
//         "Booking confirmed successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Confirm booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to confirm booking",
//     });
//   }
// };

// // ======================================================
// // REJECT BOOKING
// // ======================================================

// exports.rejectBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const vendor =
//       await getVendorForUser(
//         req.user.id
//       );

//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Vendor profile not found",
//       });
//     }

//     const booking =
//       await Booking.findOne({
//         _id: req.params.id,
//         vendor: vendor._id,
//       });

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     if (
//       [
//         "completed",
//         "cancelled",
//         "rejected",
//       ].includes(booking.status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Booking cannot be rejected",
//       });
//     }

//     booking.status = "rejected";

//     if (
//       booking.rejectionReason !==
//       undefined
//     ) {
//       booking.rejectionReason =
//         req.body.reason || "";
//     }

//     if (
//       booking.rejectedAt !==
//       undefined
//     ) {
//       booking.rejectedAt =
//         new Date();
//     }

//     await booking.save();

//     if (booking.slot) {
//       await releaseSlot(
//         booking.slot
//       );
//     }

//     return res.json({
//       success: true,
//       message:
//         "Booking rejected successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Reject booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to reject booking",
//     });
//   }
// };

// // ======================================================
// // CANCEL BOOKING
// // ======================================================

// exports.cancelBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const booking =
//       await Booking.findById(
//         req.params.id
//       );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     const vendor =
//       await Vendor.findOne({
//         user: req.user.id,
//       }).select("_id");

//     const isCustomer =
//       String(
//         booking.customer
//       ) === String(req.user.id);

//     const isVendor =
//       vendor &&
//       String(vendor._id) ===
//         String(booking.vendor);

//     if (
//       !isCustomer &&
//       !isVendor &&
//       req.user.role !== "admin"
//     ) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied",
//       });
//     }

//     if (
//       [
//         "completed",
//         "cancelled",
//         "rejected",
//       ].includes(booking.status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Booking cannot be cancelled",
//       });
//     }

//     booking.status = "cancelled";

//     if (
//       booking.cancelledBy !==
//       undefined
//     ) {
//       booking.cancelledBy =
//         req.user.id;
//     }

//     if (
//       booking.cancellationReason !==
//       undefined
//     ) {
//       booking.cancellationReason =
//         req.body.reason || "";
//     }

//     if (
//       booking.cancelledAt !==
//       undefined
//     ) {
//       booking.cancelledAt =
//         new Date();
//     }

//     await booking.save();

//     if (booking.slot) {
//       await releaseSlot(
//         booking.slot
//       );
//     }

//     return res.json({
//       success: true,
//       message:
//         "Booking cancelled successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Cancel booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to cancel booking",
//     });
//   }
// };

// // ======================================================
// // RESCHEDULE BOOKING
// // ======================================================

// exports.rescheduleBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const {
//       slotId,
//       bookingDate,
//       startTime,
//       endTime,
//       reason,
//     } = req.body;

//     const booking =
//       await Booking.findById(
//         req.params.id
//       );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     if (
//       String(
//         booking.customer
//       ) !== String(req.user.id) &&
//       req.user.role !== "admin"
//     ) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Only customer or admin can reschedule this booking",
//       });
//     }

//     if (
//       [
//         "completed",
//         "cancelled",
//         "rejected",
//       ].includes(booking.status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Booking cannot be rescheduled",
//       });
//     }

//     let newSlot = null;

//     if (slotId) {
//       if (!isValidObjectId(slotId)) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid slotId",
//         });
//       }

//       newSlot =
//         await Slot.findOne({
//           _id: slotId,
//           vendor: booking.vendor,
//           isBooked: {
//             $ne: true,
//           },
//           isBlocked: {
//             $ne: true,
//           },
//         });

//       if (!newSlot) {
//         return res.status(409).json({
//           success: false,
//           message:
//             "Selected slot is unavailable",
//         });
//       }
//     }

//     const oldSlot =
//       booking.slot;

//     if (newSlot) {
//       booking.slot =
//         newSlot._id;

//       booking.bookingDate =
//         newSlot.date;

//       booking.startTime =
//         newSlot.startTime;

//       booking.endTime =
//         newSlot.endTime;
//     } else {
//       if (bookingDate) {
//         booking.bookingDate =
//           bookingDate;
//       }

//       if (startTime) {
//         booking.startTime =
//           startTime;
//       }

//       if (endTime) {
//         booking.endTime =
//           endTime;
//       }
//     }

//     if (
//       booking.rescheduleReason !==
//       undefined
//     ) {
//       booking.rescheduleReason =
//         reason || "";
//     }

//     if (
//       booking.rescheduledAt !==
//       undefined
//     ) {
//       booking.rescheduledAt =
//         new Date();
//     }

//     booking.status = "pending";

//     await booking.save();

//     if (
//       oldSlot &&
//       (!newSlot ||
//         String(oldSlot) !==
//           String(newSlot._id))
//     ) {
//       await releaseSlot(
//         oldSlot
//       );
//     }

//     if (newSlot) {
//       const locked =
//         await bookSlot(
//           newSlot._id,
//           booking._id
//         );

//       if (!locked) {
//         return res.status(409).json({
//           success: false,
//           message:
//             "New slot could not be locked",
//         });
//       }
//     }

//     return res.json({
//       success: true,
//       message:
//         "Booking rescheduled successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Reschedule booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to reschedule booking",
//     });
//   }
// };

// // ======================================================
// // START BOOKING
// // ======================================================

// exports.startBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const vendor =
//       await getVendorForUser(
//         req.user.id
//       );

//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Vendor profile not found",
//       });
//     }

//     const booking =
//       await Booking.findOne({
//         _id: req.params.id,
//         vendor: vendor._id,
//       });

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     if (
//       ![
//         "confirmed",
//         "pending",
//       ].includes(
//         booking.status
//       )
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Booking cannot be started",
//       });
//     }

//     booking.status = "in_progress";

//     if (
//       booking.startedAt !==
//       undefined
//     ) {
//       booking.startedAt =
//         new Date();
//     }

//     await booking.save();

//     return res.json({
//       success: true,
//       message:
//         "Booking started successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Start booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to start booking",
//     });
//   }
// };

// // ======================================================
// // COMPLETE BOOKING
// // ======================================================

// exports.completeBooking = async (
//   req,
//   res
// ) => {
//   try {
//     const booking =
//       await Booking.findById(
//         req.params.id
//       );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     const vendor =
//       await Vendor.findOne({
//         user: req.user.id,
//       }).select("_id");

//     const isVendor =
//       vendor &&
//       String(vendor._id) ===
//         String(booking.vendor);

//     if (
//       !isVendor &&
//       req.user.role !== "admin"
//     ) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Only vendor or admin can complete booking",
//       });
//     }

//     if (
//       [
//         "completed",
//         "cancelled",
//         "rejected",
//       ].includes(booking.status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Booking cannot be completed",
//       });
//     }

//     booking.status =
//       "completed";

//     if (
//       booking.completedAt !==
//       undefined
//     ) {
//       booking.completedAt =
//         new Date();
//     }

//     await booking.save();

//     if (booking.slot) {
//       await releaseSlot(
//         booking.slot
//       );
//     }

//     return res.json({
//       success: true,
//       message:
//         "Booking completed successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Complete booking error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to complete booking",
//     });
//   }
// };

// // ======================================================
// // MARK NO SHOW
// // ======================================================

// exports.markNoShow = async (
//   req,
//   res
// ) => {
//   try {
//     const vendor =
//       await getVendorForUser(
//         req.user.id
//       );

//     if (!vendor) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Vendor profile not found",
//       });
//     }

//     const booking =
//       await Booking.findOne({
//         _id: req.params.id,
//         vendor: vendor._id,
//       });

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     if (
//       [
//         "completed",
//         "cancelled",
//         "rejected",
//       ].includes(booking.status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid booking status",
//       });
//     }

//     booking.status =
//       "no_show";

//     if (
//       booking.noShowAt !==
//       undefined
//     ) {
//       booking.noShowAt =
//         new Date();
//     }

//     await booking.save();

//     if (booking.slot) {
//       await releaseSlot(
//         booking.slot
//       );
//     }

//     return res.json({
//       success: true,
//       message:
//         "Booking marked as no-show",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Mark no-show error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to mark booking no-show",
//     });
//   }
// };

// // ======================================================
// // GENERATE SERVICE OTP
// // ======================================================

// exports.generateServiceOtp = async (
//   req,
//   res
// ) => {
//   try {
//     const booking =
//       await Booking.findById(
//         req.params.id
//       );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     if (
//       String(
//         booking.customer
//       ) !== String(req.user.id)
//     ) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Only customer can generate service OTP",
//       });
//     }

//     if (
//       ![
//         "confirmed",
//         "in_progress",
//       ].includes(
//         booking.status
//       )
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Service OTP cannot be generated for this booking",
//       });
//     }

//     const otp = generateOtp();

//     booking.serviceOtp = otp;
//     booking.serviceOtpExpiresAt =
//       new Date(
//         Date.now() + 10 * 60 * 1000
//       );

//     await booking.save();

//     return res.json({
//       success: true,
//       message:
//         "Service OTP generated",
//       otp:
//         process.env.OTP_DEV_MODE ===
//         "true"
//           ? otp
//           : undefined,
//     });
//   } catch (error) {
//     console.error(
//       "Generate service OTP error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to generate service OTP",
//     });
//   }
// };

// // ======================================================
// // VERIFY SERVICE OTP
// // ======================================================

// exports.verifyServiceOtp = async (
//   req,
//   res
// ) => {
//   try {
//     const { otp } =
//       req.body;

//     if (!otp) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "OTP is required",
//       });
//     }

//     const booking =
//       await Booking.findById(
//         req.params.id
//       );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     const vendor =
//       await Vendor.findOne({
//         user: req.user.id,
//       }).select("_id");

//     const isVendor =
//       vendor &&
//       String(vendor._id) ===
//         String(booking.vendor);

//     if (
//       !isVendor &&
//       req.user.role !== "admin"
//     ) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Only vendor or admin can verify service OTP",
//       });
//     }

//     if (
//       !booking.serviceOtp
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Service OTP not generated",
//       });
//     }

//     if (
//       booking.serviceOtpExpiresAt &&
//       booking.serviceOtpExpiresAt <
//         new Date()
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Service OTP expired",
//       });
//     }

//     if (
//       String(
//         booking.serviceOtp
//       ) !== String(otp)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid service OTP",
//       });
//     }

//     booking.serviceOtpVerified =
//       true;

//     booking.serviceOtpVerifiedAt =
//       new Date();

//     await booking.save();

//     return res.json({
//       success: true,
//       message:
//         "Service OTP verified successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Verify service OTP error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to verify service OTP",
//     });
//   }
// };

// // ======================================================
// // UPDATE PAYMENT
// // ======================================================

// exports.updatePayment = async (
//   req,
//   res
// ) => {
//   try {
//     const {
//       paymentStatus,
//       paymentId,
//       paymentMethod,
//       transactionId,
//     } = req.body;

//     const allowedStatuses = [
//       "pending",
//       "paid",
//       "failed",
//       "refunded",
//       "partially_refunded",
//     ];

//     if (
//       !allowedStatuses.includes(
//         paymentStatus
//       )
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid paymentStatus",
//       });
//     }

//     const booking =
//       await Booking.findById(
//         req.params.id
//       );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     if (
//       req.user.role !==
//       "admin"
//     ) {
//       const vendor =
//         await Vendor.findOne({
//           user: req.user.id,
//         }).select("_id");

//       const allowed =
//         String(
//           booking.customer
//         ) ===
//           String(req.user.id) ||
//         (vendor &&
//           String(vendor._id) ===
//             String(
//               booking.vendor
//             ));

//       if (!allowed) {
//         return res.status(403).json({
//           success: false,
//           message:
//             "Access denied",
//         });
//       }
//     }

//     booking.paymentStatus =
//       paymentStatus;

//     if (
//       paymentId !==
//       undefined
//     ) {
//       booking.paymentId =
//         paymentId;
//     }

//     if (
//       paymentMethod !==
//       undefined
//     ) {
//       booking.paymentMethod =
//         paymentMethod;
//     }

//     if (
//       transactionId !==
//       undefined
//     ) {
//       booking.transactionId =
//         transactionId;
//     }

//     if (
//       paymentStatus ===
//         "paid" &&
//       booking.paidAt !==
//         undefined
//     ) {
//       booking.paidAt =
//         new Date();
//     }

//     await booking.save();

//     return res.json({
//       success: true,
//       message:
//         "Payment status updated successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Update payment error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to update payment",
//     });
//   }
// };

// // ======================================================
// // ADMIN - ALL BOOKINGS
// // ======================================================

// exports.getAllBookings = async (
//   req,
//   res
// ) => {
//   try {
//     const {
//       status,
//       serviceType,
//       vendorId,
//       customerId,
//       page = 1,
//       limit = 50,
//       search,
//     } = req.query;

//     const filter = {};

//     if (status) {
//       filter.status = status;
//     }

//     if (serviceType) {
//       filter.serviceType =
//         serviceType;
//     }

//     if (
//       vendorId &&
//       isValidObjectId(vendorId)
//     ) {
//       filter.vendor = vendorId;
//     }

//     if (
//       customerId &&
//       isValidObjectId(customerId)
//     ) {
//       filter.customer =
//         customerId;
//     }

//     const skip =
//       (Number(page) - 1) *
//       Number(limit);

//     let query =
//       Booking.find(filter)
//         .populate(
//           "customer",
//           "name phone email"
//         )
//         .populate(
//           "vendor",
//           "name phone email role city state"
//         )
//         .populate(
//           "puja",
//           "name slug category basePrice durationMinutes"
//         )
//         .populate("slot")
//         .sort({
//           createdAt: -1,
//         })
//         .skip(skip)
//         .limit(Number(limit));

//     let bookings =
//       await query;

//     if (search) {
//       const term =
//         String(search)
//           .trim()
//           .toLowerCase();

//       bookings =
//         bookings.filter(
//           (booking) => {
//             const customerName =
//               booking.customer
//                 ?.name ||
//               "";

//             const vendorName =
//               booking.vendor
//                 ?.name ||
//               "";

//             const pujaName =
//               booking.pujaName ||
//               booking.puja?.name ||
//               "";

//             return (
//               customerName
//                 .toLowerCase()
//                 .includes(term) ||
//               vendorName
//                 .toLowerCase()
//                 .includes(term) ||
//               pujaName
//                 .toLowerCase()
//                 .includes(term)
//             );
//           }
//         );
//     }

//     const total =
//       await Booking.countDocuments(
//         filter
//       );

//     return res.json({
//       success: true,
//       bookings,
//       pagination: {
//         page: Number(page),
//         limit: Number(limit),
//         total,
//         pages: Math.ceil(
//           total / Number(limit)
//         ),
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Admin get bookings error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to fetch all bookings",
//     });
//   }
// };

// // ======================================================
// // ADMIN - UPDATE STATUS
// // ======================================================

// exports.adminUpdateStatus = async (
//   req,
//   res
// ) => {
//   try {
//     const {
//       status,
//       reason,
//     } = req.body;

//     const allowedStatuses = [
//       "pending",
//       "confirmed",
//       "rejected",
//       "cancelled",
//       "in_progress",
//       "completed",
//       "no_show",
//     ];

//     if (
//       !allowedStatuses.includes(
//         status
//       )
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid booking status",
//       });
//     }

//     const booking =
//       await Booking.findById(
//         req.params.id
//       );

//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Booking not found",
//       });
//     }

//     const oldStatus =
//       booking.status;

//     booking.status =
//       status;

//     if (
//       status === "cancelled"
//     ) {
//       if (
//         booking.cancellationReason !==
//         undefined
//       ) {
//         booking.cancellationReason =
//           reason || "";
//       }

//       if (
//         booking.cancelledAt !==
//         undefined
//       ) {
//         booking.cancelledAt =
//           new Date();
//       }
//     }

//     if (
//       status === "completed"
//     ) {
//       if (
//         booking.completedAt !==
//         undefined
//       ) {
//         booking.completedAt =
//           new Date();
//       }
//     }

//     if (
//       status === "in_progress"
//     ) {
//       if (
//         booking.startedAt !==
//         undefined
//       ) {
//         booking.startedAt =
//           new Date();
//       }
//     }

//     if (
//       status === "rejected"
//     ) {
//       if (
//         booking.rejectionReason !==
//         undefined
//       ) {
//         booking.rejectionReason =
//           reason || "";
//       }

//       if (
//         booking.rejectedAt !==
//         undefined
//       ) {
//         booking.rejectedAt =
//           new Date();
//       }
//     }

//     await booking.save();

//     if (
//       [
//         "cancelled",
//         "rejected",
//         "completed",
//         "no_show",
//       ].includes(status) &&
//       booking.slot
//     ) {
//       await releaseSlot(
//         booking.slot
//       );
//     }

//     return res.json({
//       success: true,
//       message:
//         "Booking status updated successfully",
//       oldStatus,
//       newStatus: status,
//       booking,
//     });
//   } catch (error) {
//     console.error(
//       "Admin update booking status error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to update booking status",
//     });
//   }
// };

// // ======================================================
// // ADMIN - BOOKING STATS
// // ======================================================

// exports.getBookingStats = async (
//   req,
//   res
// ) => {
//   try {
//     const [
//       total,
//       pending,
//       confirmed,
//       inProgress,
//       completed,
//       cancelled,
//       rejected,
//       noShow,
//     ] = await Promise.all([
//       Booking.countDocuments(),

//       Booking.countDocuments({
//         status: "pending",
//       }),

//       Booking.countDocuments({
//         status: "confirmed",
//       }),

//       Booking.countDocuments({
//         status: "in_progress",
//       }),

//       Booking.countDocuments({
//         status: "completed",
//       }),

//       Booking.countDocuments({
//         status: "cancelled",
//       }),

//       Booking.countDocuments({
//         status: "rejected",
//       }),

//       Booking.countDocuments({
//         status: "no_show",
//       }),
//     ]);

//     const revenueResult =
//       await Booking.aggregate([
//         {
//           $match: {
//             status: "completed",
//           },
//         },
//         {
//           $group: {
//             _id: null,
//             totalRevenue: {
//               $sum: {
//                 $ifNull: [
//                   "$totalAmount",
//                   0,
//                 ],
//               },
//             },
//           },
//         },
//       ]);

//     const revenue =
//       revenueResult[0]
//         ?.totalRevenue || 0;

//     return res.json({
//       success: true,
//       stats: {
//         total,
//         pending,
//         confirmed,
//         inProgress,
//         completed,
//         cancelled,
//         rejected,
//         noShow,
//         totalRevenue: revenue,
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Booking stats error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Failed to fetch booking stats",
//     });
//   }
// };




const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Slot = require("../models/Slot");
const Vendor = require("../models/Vendor");
const { computePujaFare } = require("../services/pricingService");
const { settleBookingEarning } = require("../services/earningService");
const { notifyUser } = require("../services/notificationService");

const {
  notifyBookingCreated,
  notifyBookingAccepted,
  notifyBookingRejected,
  notifyBookingCancelled,
  notifyBookingRescheduled,
  notifyBookingStarted,
  notifyBookingCompleted,
  notifyBookingNoShow,
} = require("../services/notificationService");

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const generateOtp = () => {
  return Math.floor(
    100000 + Math.random() * 900000
  ).toString();
};

const getVendorForUser = async (userId) => {
  return Vendor.findOne({
    user: userId,
  });
};

const calculatePricing = ({
  amount = 0,
  discountAmount = 0,
  platformFee = 0,
  taxAmount = 0,
  convenienceFee = 0,
  commissionPercentage = 0,
}) => {
  const baseAmount = Math.max(
    0,
    Number(amount) || 0
  );

  const discount = Math.max(
    0,
    Number(discountAmount) || 0
  );

  const platform = Math.max(
    0,
    Number(platformFee) || 0
  );

  const tax = Math.max(
    0,
    Number(taxAmount) || 0
  );

  const convenience = Math.max(
    0,
    Number(convenienceFee) || 0
  );

  const commissionPercent = Math.min(
    100,
    Math.max(
      0,
      Number(commissionPercentage) || 0
    )
  );

  const payableBase = Math.max(
    0,
    baseAmount - discount
  );

  const totalAmount =
    payableBase +
    platform +
    tax +
    convenience;

  const commissionAmount =
    (payableBase * commissionPercent) / 100;

  const vendorAmount = Math.max(
    0,
    payableBase - commissionAmount
  );

  return {
    baseAmount,
    discountAmount: discount,
    platformFee: platform,
    taxAmount: tax,
    convenienceFee: convenience,
    totalAmount,
    commissionPercentage:
      commissionPercent,
    commissionAmount,
    vendorAmount,
  };
};

const releaseSlot = async (booking) => {
  if (!booking.slot) {
    return;
  }

  await Slot.findOneAndUpdate(
    {
      _id: booking.slot,
      bookingId: booking._id,
    },
    {
      $set: {
        status: "available",
        customer: null,
        bookingId: null,
      },
    }
  );
};

const bookSlot = async (
  slot,
  booking
) => {
  slot.status = "booked";
  slot.customer = booking.customer;
  slot.bookingId = booking._id;

  await slot.save();
};

// ======================================================
// CREATE BOOKING
// ======================================================

exports.createBooking = async (
  req,
  res
) => {
  try {
    if (
      req.user.role !==
      "customer"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only customers can create bookings",
      });
    }

    const {
      vendorId,
      slotId,
      serviceType,
      title,
      description,
      address,
      city,
      state,
      pincode,
      latitude,
      longitude,
      timezone,
      notes,
      customerNotes,
      amount,
      baseAmount,
      discountAmount,
      couponCode,
      platformFee,
      taxAmount,
      convenienceFee,
      paymentMethod,
      source,
      metadata,
    } = req.body;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message:
          "Vendor ID is required",
      });
    }

    if (
      !isValidObjectId(
        vendorId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid vendor ID",
      });
    }

    const vendor =
      await Vendor.findOne({
        _id: vendorId,
        status: "approved",
      });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message:
          "Approved vendor not found",
      });
    }

    let slot = null;

    if (slotId) {
      if (
        !isValidObjectId(
          slotId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid slot ID",
        });
      }

      slot =
        await Slot.findOne({
          _id: slotId,
          vendor: vendor._id,
        });

      if (!slot) {
        return res.status(404).json({
          success: false,
          message:
            "Slot not found",
        });
      }

      if (
        slot.status !==
        "available"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This slot is not available",
        });
      }
    }

    if (slot) {
      const slotBooking =
        await Booking.findOne({
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

      if (slotBooking) {
        return res.status(409).json({
          success: false,
          message:
            "This slot has already been booked",
        });
      }
    }

    // ---- SERVER-SIDE PRICING: amounts, discounts and fees sent by the client are ignored ----
    const catalogPujaId = req.body.pujaId;
    const catalogServiceId = req.body.panditPujaServiceId || req.body.panditServiceId;
    if (!catalogPujaId && !catalogServiceId) {
      return res.status(400).json({
        success: false,
        message:
          "pujaId or panditPujaServiceId is required. Use the dedicated flows for consultations, mandali and orders.",
      });
    }
    let serverFare;
    try {
      serverFare = await computePujaFare({
        pujaId: catalogPujaId,
        panditServiceId: catalogServiceId,
        withSamagri: Boolean(req.body.withSamagri),
        vendorCommissionPercent: vendor.commissionPercentage,
      });
    } catch (e) {
      return res.status(e.status || 400).json({ success: false, message: e.message });
    }
    if (
      serverFare.service &&
      String(serverFare.service.pandit) !== String(vendor._id)
    ) {
      return res.status(400).json({
        success: false,
        message: "This puja service does not belong to the selected pandit",
      });
    }
    const pricing = calculatePricing({
      amount:
        serverFare.breakdown.pujaPrice + serverFare.breakdown.samagriPrice,
      platformFee: serverFare.breakdown.platformFee,
      taxAmount: serverFare.breakdown.taxAmount,
      commissionPercentage: serverFare.breakdown.commissionPercentage,
    });

    const booking =
      await Booking.create({
        customer:
          req.user.id,

        vendor:
          vendor._id,

        slot: slot
          ? slot._id
          : null,

        serviceType:
          serviceType ||
          "other",

        title:
          title ||
          "Service Booking",

        description:
          description || "",

        scheduledDate:
          slot?.date || "",

        startTime:
          slot?.startTime || "",

        endTime:
          slot?.endTime || "",

        timezone:
          timezone ||
          "Asia/Kolkata",

        address:
          address || "",

        city:
          city || "",

        state:
          state || "",

        pincode:
          pincode || "",

        latitude:
          latitude !==
          undefined
            ? latitude
            : null,

        longitude:
          longitude !==
          undefined
            ? longitude
            : null,

        notes:
          notes || "",

        customerNotes:
          customerNotes || "",

        amount:
          pricing.baseAmount,

        baseAmount:
          pricing.baseAmount,

        discountAmount:
          pricing.discountAmount,

        couponCode: "",
        puja: serverFare.puja ? serverFare.puja._id : null,
        pujaName: serverFare.puja ? serverFare.puja.name : "",
        pujaCategory: serverFare.puja ? serverFare.puja.category : "",
        pujaBasePrice: serverFare.breakdown.pujaPrice,
        pujaDurationMinutes: serverFare.puja ? serverFare.puja.durationMinutes : 0,
        panditPujaService: serverFare.service ? serverFare.service._id : null,

        platformFee:
          pricing.platformFee,

        taxAmount:
          pricing.taxAmount,

        convenienceFee:
          pricing.convenienceFee,

        totalAmount:
          pricing.totalAmount,

        commissionAmount:
          pricing.commissionAmount,

        commissionPercentage:
          pricing.commissionPercentage,

        vendorAmount:
          pricing.vendorAmount,

        paymentMethod:
          paymentMethod ||
          "other",

        paymentStatus:
          "pending",

        status:
          "pending",

        source:
          source || "app",

        metadata:
          metadata || {},
      });

    if (slot) {
      const claimedSlot = await Slot.findOneAndUpdate(
        { _id: slot._id, status: "available" },
        {
          $set: {
            status: "booked",
            customer: booking.customer,
            bookingId: booking._id,
          },
        },
        { new: true }
      );
      if (!claimedSlot) {
        await Booking.deleteOne({ _id: booking._id });
        return res.status(409).json({
          success: false,
          message: "This slot was just booked by someone else",
        });
      }
    }

    // ==================================================
    // BOOKING CREATED NOTIFICATION
    // ==================================================

    await notifyBookingCreated({
      userId: vendor.user,
      booking,
      vendorName:
        vendor.name ||
        "Partner",
    });

    await booking.populate([
      {
        path: "vendor",
        select:
          "name role profileImage city state isOnline status chatRate audioRate videoRate",
      },
      {
        path: "slot",
        select:
          "date startTime endTime status",
      },
    ]);

    return res.status(201).json({
      success: true,
      message:
        "Booking created successfully",
      booking,
    });
  } catch (error) {
    console.error(
      "Create Booking Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create booking",
    });
  }
};

// ======================================================
// CUSTOMER BOOKINGS
// ======================================================

exports.getMyBookings =
  async (
    req,
    res
  ) => {
    try {
      let page = Number(
        req.query.page || 1
      );

      let limit = Number(
        req.query.limit || 20
      );

      if (page < 1)
        page = 1;

      if (limit < 1)
        limit = 20;

      if (limit > 100)
        limit = 100;

      const filter = {
        customer:
          req.user.id,
      };

      if (
        req.query.status &&
        [
          "pending",
          "confirmed",
          "rescheduled",
          "in_progress",
          "completed",
          "cancelled",
          "rejected",
          "no_show",
        ].includes(
          req.query.status
        )
      ) {
        filter.status =
          req.query.status;
      }

      if (
        req.query.serviceType
      ) {
        filter.serviceType =
          req.query.serviceType;
      }

      const total =
        await Booking.countDocuments(
          filter
        );

      const bookings =
        await Booking.find(
          filter
        )
          .populate(
            "vendor",
            "name role profileImage city state isOnline"
          )
          .populate(
            "slot",
            "date startTime endTime status"
          )
          .sort({
            createdAt: -1,
          })
          .skip(
            (page - 1) *
              limit
          )
          .limit(limit);

      return res.json({
        success: true,
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
        bookings,
      });
    } catch (error) {
      console.error(
        "Get My Bookings Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch bookings",
      });
    }
  };

// ======================================================
// VENDOR BOOKINGS
// ======================================================

exports.getVendorBookings =
  async (
    req,
    res
  ) => {
    try {
      const vendor =
        await getVendorForUser(
          req.user.id
        );

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message:
            "Vendor profile not found",
        });
      }

      let page = Number(
        req.query.page || 1
      );

      let limit = Number(
        req.query.limit || 20
      );

      if (page < 1)
        page = 1;

      if (limit < 1)
        limit = 20;

      if (limit > 100)
        limit = 100;

      const filter = {
        vendor:
          vendor._id,
      };

      if (req.query.status) {
        filter.status =
          req.query.status;
      }

      if (
        req.query.serviceType
      ) {
        filter.serviceType =
          req.query.serviceType;
      }

      if (req.query.date) {
        filter.scheduledDate =
          req.query.date;
      }

      const total =
        await Booking.countDocuments(
          filter
        );

      const bookings =
        await Booking.find(
          filter
        )
          .populate(
            "customer",
            "name phone email role"
          )
          .populate(
            "slot",
            "date startTime endTime status"
          )
          .sort({
            scheduledDate: 1,
            startTime: 1,
            createdAt: -1,
          })
          .skip(
            (page - 1) *
              limit
          )
          .limit(limit);

      return res.json({
        success: true,
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
        bookings,
      });
    } catch (error) {
      console.error(
        "Get Vendor Bookings Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch vendor bookings",
      });
    }
  };

// ======================================================
// GET SINGLE BOOKING
// ======================================================

exports.getBooking =
  async (
    req,
    res
  ) => {
    try {
      const { id } =
        req.params;

      if (
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid booking ID",
        });
      }

      const booking =
        await Booking.findById(
          id
        )
          .populate(
            "customer",
            "name phone email role"
          )
          .populate(
            "vendor",
            "name role profileImage city state isOnline status chatRate audioRate videoRate"
          )
          .populate(
            "slot",
            "date startTime endTime status"
          )
          .populate(
            "consultation"
          )
          .populate(
            "conversation"
          );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const isCustomer =
        booking.customer?._id?.toString() ===
        req.user.id.toString();

      let isVendor = false;

      if (!isCustomer) {
        const vendor =
          await getVendorForUser(
            req.user.id
          );

        if (vendor) {
          isVendor =
            booking.vendor?._id?.toString() ===
            vendor._id.toString();
        }
      }

      const isAdmin =
        req.user.role ===
        "admin";

      if (
        !isCustomer &&
        !isVendor &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied",
        });
      }

      return res.json({
        success: true,
        booking,
      });
    } catch (error) {
      console.error(
        "Get Booking Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch booking",
      });
    }
  };

// ======================================================
// CONFIRM BOOKING
// ======================================================

exports.confirmBooking =
  async (
    req,
    res
  ) => {
    try {
      const vendor =
        await getVendorForUser(
          req.user.id
        );

      if (
        !vendor ||
        vendor.status !==
          "approved"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Approved vendor profile required",
        });
      }

      const booking =
        await Booking.findOne({
          _id: req.params.id,
          vendor:
            vendor._id,
          status:
            "pending",
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Pending booking not found",
        });
      }

      booking.status =
        "confirmed";

      booking.confirmedAt =
        new Date();

      await booking.save();

      // ==================================================
      // BOOKING ACCEPTED NOTIFICATION
      // ==================================================

      await notifyBookingAccepted({
        userId:
          booking.customer,
        booking,
        vendorName:
          vendor.name ||
          "Partner",
      });

      return res.json({
        success: true,
        message:
          "Booking confirmed successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Confirm Booking Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to confirm booking",
      });
    }
  };

// ======================================================
// REJECT BOOKING
// ======================================================

exports.rejectBooking =
  async (
    req,
    res
  ) => {
    try {
      const vendor =
        await getVendorForUser(
          req.user.id
        );

      if (
        !vendor ||
        vendor.status !==
          "approved"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Approved vendor profile required",
        });
      }

      const booking =
        await Booking.findOne({
          _id: req.params.id,
          vendor:
            vendor._id,
          status:
            "pending",
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Pending booking not found",
        });
      }

      const reason =
        String(
          req.body.reason ||
            ""
        ).trim();

      booking.status =
        "rejected";

      booking.rejectionReason =
        reason ||
        "Booking rejected by vendor";

      booking.rejectedAt =
        new Date();

      await booking.save();

      await releaseSlot(
        booking
      );

      // ==================================================
      // BOOKING REJECTED NOTIFICATION
      // ==================================================

      await notifyBookingRejected({
        userId:
          booking.customer,
        booking,
        vendorName:
          vendor.name ||
          "Partner",
        reason:
          booking.rejectionReason,
      });

      return res.json({
        success: true,
        message:
          "Booking rejected successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Reject Booking Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to reject booking",
      });
    }
  };




  // ======================================================
// CANCEL BOOKING
// ======================================================

exports.cancelBooking =
  async (
    req,
    res
  ) => {
    try {
      const {
        reason,
      } = req.body;

      const booking =
        await Booking.findById(
          req.params.id
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const userId =
        req.user.id.toString();

      const customerId =
        booking.customer
          ? booking.customer.toString()
          : null;

      const vendor =
        await Vendor.findOne({
          user: req.user.id,
        });

      const vendorId =
        vendor?._id
          ? vendor._id.toString()
          : null;

      const bookingVendorId =
        booking.vendor
          ? booking.vendor.toString()
          : null;

      const isCustomer =
        customerId === userId;

      const isVendor =
        vendorId &&
        bookingVendorId ===
          vendorId;

      const isAdmin =
        req.user.role ===
        "admin";

      if (
        !isCustomer &&
        !isVendor &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to cancel this booking",
        });
      }

      const cancellableStatuses = [
        "pending",
        "confirmed",
        "rescheduled",
      ];

      if (
        !cancellableStatuses.includes(
          booking.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Booking cannot be cancelled in ${booking.status} status`,
        });
      }

      booking.status =
        "cancelled";

      booking.cancelledAt =
        new Date();

      booking.cancelledBy =
        req.user.id;

      booking.cancellationReason =
        String(
          reason || ""
        ).trim() ||
        "Booking cancelled";

      await booking.save();

      await releaseSlot(
        booking
      );

      // ==================================================
      // CANCELLATION NOTIFICATION
      // ==================================================

      if (isCustomer) {
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "user name"
          );

        if (
          bookingVendor?.user
        ) {
          await notifyBookingCancelled({
            userId:
              bookingVendor.user,
            booking,
            cancelledBy:
              "customer",
            reason:
              booking.cancellationReason,
          });
        }
      } else if (isVendor) {
        await notifyBookingCancelled({
          userId:
            booking.customer,
          booking,
          cancelledBy:
            "vendor",
          reason:
            booking.cancellationReason,
          vendorName:
            vendor.name ||
            "Partner",
        });
      } else if (isAdmin) {
        // Admin cancellation:
        // notify customer
        await notifyBookingCancelled({
          userId:
            booking.customer,
          booking,
          cancelledBy:
            "admin",
          reason:
            booking.cancellationReason,
        });

        // Admin cancellation:
        // notify vendor
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "user name"
          );

        if (
          bookingVendor?.user
        ) {
          await notifyBookingCancelled({
            userId:
              bookingVendor.user,
            booking,
            cancelledBy:
              "admin",
            reason:
              booking.cancellationReason,
          });
        }
      }

      return res.json({
        success: true,
        message:
          "Booking cancelled successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Cancel Booking Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to cancel booking",
      });
    }
  };

// ======================================================
// RESCHEDULE BOOKING
// ======================================================

exports.rescheduleBooking =
  async (
    req,
    res
  ) => {
    try {
      const {
        newSlotId,
        reason,
      } = req.body;

      if (!newSlotId) {
        return res.status(400).json({
          success: false,
          message:
            "New slot ID is required",
        });
      }

      if (
        !isValidObjectId(
          newSlotId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid new slot ID",
        });
      }

      const booking =
        await Booking.findById(
          req.params.id
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const vendor =
        await Vendor.findOne({
          user: req.user.id,
        });

      const userId =
        req.user.id.toString();

      const isCustomer =
        booking.customer?.toString() ===
        userId;

      const isVendor =
        vendor &&
        booking.vendor?.toString() ===
          vendor._id.toString();

      const isAdmin =
        req.user.role ===
        "admin";

      if (
        !isCustomer &&
        !isVendor &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to reschedule this booking",
        });
      }

      const allowedStatuses = [
        "pending",
        "confirmed",
        "rescheduled",
      ];

      if (
        !allowedStatuses.includes(
          booking.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Booking cannot be rescheduled in ${booking.status} status`,
        });
      }

      const newSlot =
        await Slot.findOne({
          _id: newSlotId,
          vendor:
            booking.vendor,
        });

      if (!newSlot) {
        return res.status(404).json({
          success: false,
          message:
            "New slot not found",
        });
      }

      if (
        newSlot.status !==
        "available"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "New slot is not available",
        });
      }

      if (
        booking.slot?.toString() ===
        newSlot._id.toString()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "New slot must be different from current slot",
        });
      }

      const oldSlot =
        booking.slot
          ? await Slot.findById(
              booking.slot
            )
          : null;

      const oldSlotData =
        oldSlot
          ? {
              slotId:
                oldSlot._id,
              date:
                oldSlot.date,
              startTime:
                oldSlot.startTime,
              endTime:
                oldSlot.endTime,
            }
          : {
              slotId:
                booking.slot ||
                null,
              date:
                booking.scheduledDate ||
                null,
              startTime:
                booking.startTime ||
                null,
              endTime:
                booking.endTime ||
                null,
            };

      if (
        !Array.isArray(
          booking.rescheduleHistory
        )
      ) {
        booking.rescheduleHistory =
          [];
      }

      booking.rescheduleHistory.push({
        oldSlot:
          oldSlotData.slotId,

        oldDate:
          oldSlotData.date,

        oldStartTime:
          oldSlotData.startTime,

        oldEndTime:
          oldSlotData.endTime,

        newSlot:
          newSlot._id,

        newDate:
          newSlot.date,

        newStartTime:
          newSlot.startTime,

        newEndTime:
          newSlot.endTime,

        reason:
          String(
            reason || ""
          ).trim(),

        changedBy:
          req.user.id,

        changedAt:
          new Date(),
      });

      booking.slot =
        newSlot._id;

      booking.scheduledDate =
        newSlot.date;

      booking.startTime =
        newSlot.startTime;

      booking.endTime =
        newSlot.endTime;

      booking.status =
        "rescheduled";

      booking.rescheduledAt =
        new Date();

      booking.rescheduleReason =
        String(
          reason || ""
        ).trim();

      await booking.save();

      // ==================================================
      // RELEASE OLD SLOT
      // ==================================================

      if (oldSlot) {
        oldSlot.status =
          "available";

        oldSlot.customer =
          null;

        oldSlot.bookingId =
          null;

        await oldSlot.save();
      }

      // ==================================================
      // BOOK NEW SLOT
      // ==================================================

      await bookSlot(
        newSlot,
        booking
      );

      // ==================================================
      // RESCHEDULE NOTIFICATION
      // ==================================================

      const bookingVendor =
        vendor ||
        await Vendor.findById(
          booking.vendor
        );

      if (isCustomer) {
        if (
          bookingVendor?.user
        ) {
          await notifyBookingRescheduled({
            userId:
              bookingVendor.user,
            booking,
            changedBy:
              "customer",
            reason:
              booking.rescheduleReason,
          });
        }
      } else if (isVendor) {
        await notifyBookingRescheduled({
          userId:
            booking.customer,
          booking,
          changedBy:
            "vendor",
          reason:
            booking.rescheduleReason,
          vendorName:
            vendor.name ||
            "Partner",
        });
      } else if (isAdmin) {
        await notifyBookingRescheduled({
          userId:
            booking.customer,
          booking,
          changedBy:
            "admin",
          reason:
            booking.rescheduleReason,
        });

        if (
          bookingVendor?.user
        ) {
          await notifyBookingRescheduled({
            userId:
              bookingVendor.user,
            booking,
            changedBy:
              "admin",
            reason:
              booking.rescheduleReason,
          });
        }
      }

      return res.json({
        success: true,
        message:
          "Booking rescheduled successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Reschedule Booking Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to reschedule booking",
      });
    }
  };

// ======================================================
// START BOOKING
// ======================================================

exports.startBooking =
  async (
    req,
    res
  ) => {
    try {
      const vendor =
        await getVendorForUser(
          req.user.id
        );

      if (
        !vendor ||
        vendor.status !==
          "approved"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Approved vendor profile required",
        });
      }

      const booking =
        await Booking.findOne({
          _id: req.params.id,
          vendor:
            vendor._id,
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const allowedStatuses = [
        "pending",
        "confirmed",
        "rescheduled",
      ];

      if (
        !allowedStatuses.includes(
          booking.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Booking cannot be started in ${booking.status} status`,
        });
      }

      booking.status =
        "in_progress";

      booking.startedAt =
        new Date();

      await booking.save();

      // ==================================================
      // BOOKING STARTED NOTIFICATION
      // ==================================================

      await notifyBookingStarted({
        userId:
          booking.customer,
        booking,
        vendorName:
          vendor.name ||
          "Partner",
      });

      return res.json({
        success: true,
        message:
          "Booking started successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Start Booking Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to start booking",
      });
    }
  };

// ======================================================
// COMPLETE BOOKING
// ======================================================

exports.completeBooking =
  async (
    req,
    res
  ) => {
    try {
      const vendor =
        await getVendorForUser(
          req.user.id
        );

      const isAdmin =
        req.user.role ===
        "admin";

      if (
        !vendor &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Vendor or admin access required",
        });
      }

      const query = {
        _id: req.params.id,
      };

      if (!isAdmin) {
        query.vendor =
          vendor._id;
      }

      const booking =
        await Booking.findOne(
          query
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const physicalService = ["pandit", "puja", "mandali"].includes(
        booking.serviceType
      );
      const skipOtp = Boolean(booking.metadata && booking.metadata.dailyPuja);
      const allowedStatuses =
        isAdmin || !physicalService || skipOtp
          ? ["in_progress", "confirmed"]
          : ["in_progress"];

      if (
        !allowedStatuses.includes(
          booking.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Booking cannot be completed in ${booking.status} status`,
        });
      }

      if (
        booking.paymentMethod === "cash" &&
        booking.paymentStatus !== "paid"
      ) {
        booking.paymentStatus = "paid";
        booking.paidAt = new Date();
      }
      booking.status = "completed";

      booking.completedAt =
        new Date();

      await booking.save();

      await releaseSlot(booking);

      try {
        await settleBookingEarning(booking);
      } catch (earningError) {
        console.error("Earning settlement failed:", earningError);
      }

      // ==================================================
      // BOOKING COMPLETED NOTIFICATION
      // ==================================================

      const vendorName =
        vendor?.name ||
        (
          await Vendor.findById(
            booking.vendor
          ).select("name")
        )?.name ||
        "Partner";

      await notifyBookingCompleted({
        userId:
          booking.customer,
        booking,
        vendorName,
      });

      return res.json({
        success: true,
        message:
          "Booking completed successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Complete Booking Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to complete booking",
      });
    }
  };

// ======================================================
// MARK NO SHOW
// ======================================================

exports.markNoShow =
  async (
    req,
    res
  ) => {
    try {
      const vendor =
        await getVendorForUser(
          req.user.id
        );

      if (
        !vendor ||
        vendor.status !==
          "approved"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Approved vendor profile required",
        });
      }

      const booking =
        await Booking.findOne({
          _id: req.params.id,
          vendor:
            vendor._id,
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const allowedStatuses = [
        "pending",
        "confirmed",
        "rescheduled",
        "in_progress",
      ];

      if (
        !allowedStatuses.includes(
          booking.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Booking cannot be marked no-show in ${booking.status} status`,
        });
      }

      booking.status =
        "no_show";

      booking.noShowAt =
        new Date();

      booking.noShowReason =
        String(
          req.body.reason ||
            "Customer did not attend the booking"
        ).trim();

      await booking.save();

      await releaseSlot(
        booking
      );

      // ==================================================
      // NO SHOW NOTIFICATION
      // ==================================================

      await notifyBookingNoShow({
        userId:
          booking.customer,
        booking,
        vendorName:
          vendor.name ||
          "Partner",
        reason:
          booking.noShowReason,
      });

      return res.json({
        success: true,
        message:
          "Booking marked as no-show",
        booking,
      });
    } catch (error) {
      console.error(
        "Mark No Show Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to mark booking as no-show",
      });
    }
  };


  // ======================================================
// GENERATE SERVICE OTP
// ======================================================

exports.generateServiceOtp =
  async (
    req,
    res
  ) => {
    try {
      const vendor =
        await Vendor.findOne({
          user: req.user.id,
          role: "pandit",
          status: "approved",
        });

      if (!vendor) {
        return res.status(403).json({
          success: false,
          message:
            "Approved pandit profile required",
        });
      }

      const booking =
        await Booking.findOne({
          _id: req.params.id,
          vendor: vendor._id,
          serviceType: { $in: ["pandit", "puja"] },
          status: "confirmed",
        }).select(
          "+serviceOtp +serviceOtpExpiresAt +serviceOtpAttempts"
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Confirmed pandit booking not found",
        });
      }

      const otp =
        generateOtp();

      booking.serviceOtp =
        otp;

      booking.serviceOtpExpiresAt =
        new Date(
          Date.now() +
            10 * 60 * 1000
        );

      booking.serviceOtpAttempts =
        0;

      booking.serviceOtpVerified =
        false;

      booking.serviceOtpVerifiedAt =
        null;

      await booking.save();

      await notifyUser({
        userId: booking.customer,
        title: "Your puja start OTP",
        message: `Share OTP ${otp} with your pandit to start the puja. Valid for 10 minutes.`,
        type: "booking_started",
        priority: "high",
        referenceId: booking._id,
        referenceType: "booking",
      }).catch((e) => console.error("OTP notify failed:", e.message));

      return res.json({
        success: true,
        message: "Service OTP sent to the customer",
        expiresInMinutes: 10,
        ...(process.env.OTP_DEV_MODE === "true" ? { devOtp: otp } : {}),
      });
    } catch (error) {
      console.error(
        "Generate Service OTP Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate service OTP",
      });
    }
  };

// ======================================================
// VERIFY SERVICE OTP
// ======================================================

exports.verifyServiceOtp =
  async (
    req,
    res
  ) => {
    try {
      const {
        otp,
      } = req.body;

      if (!otp) {
        return res.status(400).json({
          success: false,
          message:
            "OTP is required",
        });
      }

      const booking =
        await Booking.findOne({
          _id: req.params.id,
          customer: req.user.id,
          serviceType: "pandit",
          status: "confirmed",
        }).select(
          "+serviceOtp +serviceOtpExpiresAt +serviceOtpAttempts"
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Confirmed pandit booking not found",
        });
      }

      if (
        booking.serviceOtpVerified
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Service OTP already verified",
        });
      }

      if (
        !booking.serviceOtp
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Service OTP has not been generated",
        });
      }

      if (
        !booking.serviceOtpExpiresAt ||
        booking.serviceOtpExpiresAt.getTime() <
          Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Service OTP has expired",
        });
      }

      if (
        booking.serviceOtpAttempts >=
        5
      ) {
        return res.status(429).json({
          success: false,
          message:
            "Maximum OTP attempts exceeded",
        });
      }

      if (
        String(otp).trim() !==
        booking.serviceOtp
      ) {
        booking.serviceOtpAttempts +=
          1;

        await booking.save();

        return res.status(400).json({
          success: false,
          message:
            "Invalid service OTP",
          attemptsRemaining:
            Math.max(
              0,
              5 -
                booking.serviceOtpAttempts
            ),
        });
      }

      booking.serviceOtpVerified =
        true;

      booking.serviceOtpVerifiedAt =
        new Date();

      booking.serviceOtp =
        "";

      booking.serviceOtpExpiresAt =
        null;

      booking.serviceOtpAttempts =
        0;

      await booking.save();

      return res.json({
        success: true,
        message:
          "Service OTP verified successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Verify Service OTP Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to verify service OTP",
      });
    }
  };

// ======================================================
// UPDATE PAYMENT
// ======================================================

exports.updatePayment =
  async (
    req,
    res
  ) => {
    try {
      const {
        paymentStatus,
        paymentMethod,
        paymentId,
        paymentOrderId,
        transactionId,
        paidAt,
        refundId,
        refundAmount,
      } = req.body;

      const allowedStatuses = [
        "pending",
        "processing",
        "partial",
        "paid",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
      ];

      if (
        !allowedStatuses.includes(
          paymentStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid payment status",
        });
      }

      const booking =
        await Booking.findById(
          req.params.id
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const vendor =
        await getVendorForUser(
          req.user.id
        );

      const isCustomer =
        booking.customer.toString() ===
        req.user.id.toString();

      const isVendor =
        vendor &&
        booking.vendor.toString() ===
          vendor._id.toString();

      const isAdmin =
        req.user.role ===
        "admin";

      if (
        !isCustomer &&
        !isVendor &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied",
        });
      }

      if (!isAdmin) {
        const cashCollected =
          isVendor &&
          booking.paymentMethod === "cash" &&
          paymentStatus === "paid";
        if (!cashCollected) {
          return res.status(403).json({
            success: false,
            message:
              "Payment status can only be changed by the payment gateway or an admin",
          });
        }
      }

      booking.paymentStatus = paymentStatus;

      if (paymentMethod) {
        booking.paymentMethod =
          paymentMethod;
      }

      if (paymentId) {
        booking.paymentId =
          paymentId;
      }

      if (paymentOrderId) {
        booking.paymentOrderId =
          paymentOrderId;
      }

      if (transactionId) {
        booking.transactionId =
          transactionId;
      }

      if (paidAt) {
        booking.paidAt =
          new Date(paidAt);
      }

      if (refundId) {
        booking.refundId =
          refundId;
      }

      if (
        refundAmount !==
        undefined
      ) {
        booking.refundAmount =
          Math.max(
            0,
            Number(
              refundAmount
            ) || 0
          );
      }

      if (
        paymentStatus ===
          "paid"
      ) {
        booking.paidAt =
          booking.paidAt ||
          new Date();
      }

      if (
        paymentStatus ===
          "refunded" ||
        paymentStatus ===
          "partially_refunded"
      ) {
        booking.refundedAt =
          new Date();
      }

      await booking.save();

      if (booking.status === "completed" && booking.paymentStatus === "paid") {
        await settleBookingEarning(booking).catch((e) =>
          console.error("Settle after payment update:", e)
        );
      }

      return res.json({
        success: true,
        message: "Payment updated successfully",
        booking,
      });
    } catch (error) {
      console.error(
        "Update Payment Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update payment",
      });
    }
  };

// ======================================================
// ADMIN - ALL BOOKINGS
// ======================================================

exports.getAllBookings =
  async (
    req,
    res
  ) => {
    try {
      if (
        req.user.role !==
        "admin"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Admin access required",
        });
      }

      let page = Number(
        req.query.page || 1
      );

      let limit = Number(
        req.query.limit || 20
      );

      if (page < 1) {
        page = 1;
      }

      if (limit < 1) {
        limit = 20;
      }

      if (limit > 100) {
        limit = 100;
      }

      const filter = {};

      if (
        req.query.status
      ) {
        filter.status =
          req.query.status;
      }

      if (
        req.query.paymentStatus
      ) {
        filter.paymentStatus =
          req.query.paymentStatus;
      }

      if (
        req.query.serviceType
      ) {
        filter.serviceType =
          req.query.serviceType;
      }

      if (
        req.query.vendorId &&
        isValidObjectId(
          req.query.vendorId
        )
      ) {
        filter.vendor =
          req.query.vendorId;
      }

      if (
        req.query.customerId &&
        isValidObjectId(
          req.query.customerId
        )
      ) {
        filter.customer =
          req.query.customerId;
      }

      if (
        req.query.date
      ) {
        filter.scheduledDate =
          req.query.date;
      }

      if (
        req.query.bookingNumber
      ) {
        filter.bookingNumber =
          req.query.bookingNumber;
      }

      const total =
        await Booking.countDocuments(
          filter
        );

      const bookings =
        await Booking.find(
          filter
        )
          .populate(
            "customer",
            "name phone email role"
          )
          .populate(
            "vendor",
            "name role city state status"
          )
          .populate(
            "slot",
            "date startTime endTime status"
          )
          .sort({
            createdAt: -1,
          })
          .skip(
            (page - 1) *
              limit
          )
          .limit(limit);

      return res.json({
        success: true,
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
        bookings,
      });
    } catch (error) {
      console.error(
        "Admin Get Bookings Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch all bookings",
      });
    }
  };

// ======================================================
// ADMIN - UPDATE STATUS
// ======================================================

exports.adminUpdateStatus =
  async (
    req,
    res
  ) => {
    try {
      if (
        req.user.role !==
        "admin"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Admin access required",
        });
      }

      const {
        status,
        reason,
      } = req.body;

      const allowedStatuses = [
        "pending",
        "confirmed",
        "rescheduled",
        "in_progress",
        "completed",
        "cancelled",
        "rejected",
        "no_show",
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid booking status",
        });
      }

      const booking =
        await Booking.findById(
          req.params.id
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found",
        });
      }

      const oldStatus =
        booking.status;

      // Agar same status hai
      // to unnecessary notification nahi bhejenge
      const statusChanged =
        oldStatus !==
        status;

      booking.status =
        status;

      if (
        status ===
        "confirmed"
      ) {
        booking.confirmedAt =
          booking.confirmedAt ||
          new Date();
      }

      if (
        status ===
        "in_progress"
      ) {
        booking.startedAt =
          booking.startedAt ||
          new Date();
      }

      if (
        status ===
        "completed"
      ) {
        booking.completedAt =
          booking.completedAt ||
          new Date();

        booking.reviewEligible =
          true;

        await releaseSlot(
          booking
        );
      }

      if (
        status ===
        "cancelled"
      ) {
        booking.cancelledAt =
          new Date();

        booking.cancellationReason =
          reason ||
          "Cancelled by admin";

        booking.cancellation = {
          cancelledBy:
            "admin",

          reason:
            reason ||
            "Cancelled by admin",

          cancelledAt:
            new Date(),

          refundEligible:
            booking.paymentStatus ===
            "paid",

          refundAmount:
            booking.paymentStatus ===
            "paid"
              ? booking.totalAmount
              : 0,
        };

        await releaseSlot(
          booking
        );
      }

      if (
        status ===
        "rejected"
      ) {
        booking.rejectionReason =
          reason ||
          "Rejected by admin";

        booking.rejectedAt =
          new Date();

        await releaseSlot(
          booking
        );
      }

      if (
        status ===
        "no_show"
      ) {
        booking.noShowAt =
          new Date();

        booking.noShowReason =
          reason ||
          "Customer did not attend the booking";

        await releaseSlot(
          booking
        );
      }

      await booking.save();

      // ==================================================
      // ADMIN STATUS NOTIFICATIONS
      // ==================================================

      if (
        statusChanged &&
        status ===
          "confirmed"
      ) {
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "name"
          );

        await notifyBookingAccepted({
          userId:
            booking.customer,
          booking,
          vendorName:
            bookingVendor?.name ||
            "Partner",
        });
      }

      if (
        statusChanged &&
        status ===
          "rejected"
      ) {
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "name"
          );

        await notifyBookingRejected({
          userId:
            booking.customer,
          booking,
          vendorName:
            bookingVendor?.name ||
            "Partner",
          reason:
            booking.rejectionReason,
        });
      }

      if (
        statusChanged &&
        status ===
          "in_progress"
      ) {
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "name"
          );

        await notifyBookingStarted({
          userId:
            booking.customer,
          booking,
          vendorName:
            bookingVendor?.name ||
            "Partner",
        });
      }

      if (
        statusChanged &&
        status ===
          "completed"
      ) {
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "name"
          );

        await notifyBookingCompleted({
          userId:
            booking.customer,
          booking,
          vendorName:
            bookingVendor?.name ||
            "Partner",
        });
      }

      if (
        statusChanged &&
        status ===
          "no_show"
      ) {
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "name"
          );

        await notifyBookingNoShow({
          userId:
            booking.customer,
          booking,
          vendorName:
            bookingVendor?.name ||
            "Partner",
          reason:
            booking.noShowReason,
        });
      }

      if (
        statusChanged &&
        status ===
          "cancelled"
      ) {
        const bookingVendor =
          await Vendor.findById(
            booking.vendor
          ).select(
            "user name"
          );

        // Customer notification
        await notifyBookingCancelled({
          userId:
            booking.customer,
          booking,
          cancelledBy:
            "admin",
          reason:
            booking.cancellationReason,
        });

        // Vendor notification
        if (
          bookingVendor?.user
        ) {
          await notifyBookingCancelled({
            userId:
              bookingVendor.user,
            booking,
            cancelledBy:
              "admin",
            reason:
              booking.cancellationReason,
          });
        }
      }

      return res.json({
        success: true,
        message:
          "Booking status updated successfully",

        previousStatus:
          oldStatus,

        booking,
      });
    } catch (error) {
      console.error(
        "Admin Update Booking Status Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update booking status",
      });
    }
  };

// ======================================================
// BOOKING STATISTICS
// ======================================================

exports.getBookingStats =
  async (
    req,
    res
  ) => {
    try {
      if (
        req.user.role !==
        "admin"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Admin access required",
        });
      }

      const [
        total,
        pending,
        confirmed,
        rescheduled,
        inProgress,
        completed,
        cancelled,
        rejected,
        noShow,
        paid,
        pendingPayment,
        failedPayment,
      ] =
        await Promise.all([
          Booking.countDocuments(),

          Booking.countDocuments({
            status:
              "pending",
          }),

          Booking.countDocuments({
            status:
              "confirmed",
          }),

          Booking.countDocuments({
            status:
              "rescheduled",
          }),

          Booking.countDocuments({
            status:
              "in_progress",
          }),

          Booking.countDocuments({
            status:
              "completed",
          }),

          Booking.countDocuments({
            status:
              "cancelled",
          }),

          Booking.countDocuments({
            status:
              "rejected",
          }),

          Booking.countDocuments({
            status:
              "no_show",
          }),

          Booking.countDocuments({
            paymentStatus:
              "paid",
          }),

          Booking.countDocuments({
            paymentStatus:
              "pending",
          }),

          Booking.countDocuments({
            paymentStatus:
              "failed",
          }),
        ]);

      const revenueResult =
        await Booking.aggregate([
          {
            $match: {
              paymentStatus:
                "paid",
            },
          },

          {
            $group: {
              _id: null,

              revenue: {
                $sum:
                  "$totalAmount",
              },

              commission: {
                $sum:
                  "$commissionAmount",
              },

              vendorAmount: {
                $sum:
                  "$vendorAmount",
              },
            },
          },
        ]);

      const revenue =
        revenueResult[0] || {
          revenue: 0,
          commission: 0,
          vendorAmount: 0,
        };

      return res.json({
        success: true,

        stats: {
          total,

          pending,

          confirmed,

          rescheduled,

          inProgress,

          completed,

          cancelled,

          rejected,

          noShow,

          paid,

          pendingPayment,

          failedPayment,

          revenue:
            revenue.revenue ||
            0,

          commission:
            revenue.commission ||
            0,

          vendorAmount:
            revenue.vendorAmount ||
            0,
        },
      });
    } catch (error) {
      console.error(
        "Booking Stats Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch booking statistics",
      });
    }
  };



