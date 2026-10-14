/**
 * Server-side pricing. NEVER trust prices coming from the client.
 * All amounts in INR, rounded to 2 decimals.
 */
const Puja = require("../models/Puja");
const PanditPujaService = require("../models/PanditPujaService");

const round = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const config = () => ({
  platformFee: num(process.env.PLATFORM_FEE, 0),
  gstPercent: num(process.env.GST_PERCENT, 0), // applied on platform fee + travel
  travelFreeKm: num(process.env.TRAVEL_FREE_KM, 5),
  travelRatePerKm: num(process.env.TRAVEL_RATE_PER_KM, 10),
  commissionPercent: num(process.env.COMMISSION_PERCENT, 15),
});

const travelCharge = (distanceKm) => {
  const c = config();
  const extra = Math.max(0, num(distanceKm) - c.travelFreeKm);
  return round(extra * c.travelRatePerKm);
};

/**
 * Fare for a puja. If panditServiceId is given, the pandit's own price is used,
 * otherwise the catalog base price of the puja.
 */
const computePujaFare = async ({
  pujaId,
  panditServiceId,
  withSamagri = false,
  distanceKm = 0,
  vendorCommissionPercent = null,
}) => {
  const c = config();
  let puja = null;
  let service = null;

  if (panditServiceId) {
    service = await PanditPujaService.findOne({
      _id: panditServiceId,
      isActive: true,
      adminApproved: true,
    });
    if (!service) {
      const e = new Error("Puja service not found or not approved");
      e.status = 404;
      throw e;
    }
    pujaId = pujaId || service.puja;
  }

  if (pujaId) {
    puja = await Puja.findOne({ _id: pujaId, isActive: true });
    if (!puja) {
      const e = new Error("Puja not found");
      e.status = 404;
      throw e;
    }
  }

  if (!puja && !service) {
    const e = new Error("pujaId or panditServiceId is required");
    e.status = 400;
    throw e;
  }

  const pujaPrice = service
    ? num(service.pujaPrice) || num(service.price)
    : num(puja.basePrice);

  let samagri = 0;
  if (withSamagri) {
    samagri = service
      ? num(service.samagriPrice)
      : num(puja.samagriComboPrice);
  }

  const travel = travelCharge(distanceKm);
  const platformFee = round(c.platformFee);
  const taxable = platformFee + travel;
  const tax = round((taxable * c.gstPercent) / 100);

  const subtotal = round(pujaPrice + samagri + travel);
  const total = round(subtotal + platformFee + tax);

  const commissionPercentage =
    vendorCommissionPercent !== null && vendorCommissionPercent !== undefined
      ? num(vendorCommissionPercent)
      : c.commissionPercent;
  const commissionAmount = round(((pujaPrice + samagri) * commissionPercentage) / 100);
  // Travel charge goes fully to the pandit.
  const vendorAmount = round(pujaPrice + samagri + travel - commissionAmount);

  return {
    puja,
    service,
    breakdown: {
      pujaPrice: round(pujaPrice),
      samagriPrice: round(samagri),
      travelCharge: travel,
      distanceKm: round(num(distanceKm)),
      platformFee,
      taxAmount: tax,
      totalAmount: total,
      commissionPercentage,
      commissionAmount,
      vendorAmount,
      currency: "INR",
    },
  };
};

module.exports = { computePujaFare, travelCharge, round, config };
