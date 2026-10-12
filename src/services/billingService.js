const Commission = require("../models/Commission");

const roundMoney = (value) => {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

const calculateCommission = async ({
  serviceType = "other",
  grossAmount = 0,
}) => {
  const amount = Math.max(Number(grossAmount) || 0, 0);

  let commission = await Commission.findOne({
    serviceType,
    isActive: true,
  });

  if (!commission) {
    commission = await Commission.findOne({
      serviceType: "other",
      isActive: true,
    });
  }

  if (!commission) {
    commission = {
      percentage: 20,
      fixedAmount: 0,
    };
  }

  const percentageAmount =
    amount * (Number(commission.percentage) / 100);

  const fixedAmount =
    Number(commission.fixedAmount) || 0;

  const commissionAmount = Math.min(
    amount,
    Math.max(
      roundMoney(percentageAmount + fixedAmount),
      0
    )
  );

  const netAmount = roundMoney(
    Math.max(amount - commissionAmount, 0)
  );

  return {
    grossAmount: roundMoney(amount),
    commissionPercentage:
      Number(commission.percentage) || 0,
    commissionAmount,
    netAmount,
  };
};

const calculatePerMinuteBilling = async ({
  serviceType,
  ratePerMinute,
  durationSeconds = 0,
  minimumMinutes = 1,
}) => {
  const rate = Math.max(Number(ratePerMinute) || 0, 0);

  const seconds = Math.max(
    Number(durationSeconds) || 0,
    0
  );

  const minimum = Math.max(
    Number(minimumMinutes) || 1,
    1
  );

  const calculatedMinutes = seconds / 60;

  const billedMinutes =
    seconds > 0
      ? Math.max(calculatedMinutes, minimum)
      : 0;

  const grossAmount = roundMoney(
    billedMinutes * rate
  );

  const commission = await calculateCommission({
    serviceType,
    grossAmount,
  });

  return {
    serviceType,
    ratePerMinute: rate,
    durationSeconds: seconds,
    durationMinutes: roundMoney(calculatedMinutes),
    billedMinutes: roundMoney(billedMinutes),
    grossAmount,
    commissionPercentage:
      commission.commissionPercentage,
    commissionAmount:
      commission.commissionAmount,
    netAmount: commission.netAmount,
  };
};

const calculateBookingBilling = async ({
  serviceType = "booking",
  baseAmount = 0,
  discountAmount = 0,
  platformFee = 0,
  taxAmount = 0,
}) => {
  const base = Math.max(Number(baseAmount) || 0, 0);
  const discount = Math.min(
    base,
    Math.max(Number(discountAmount) || 0, 0)
  );

  const fee = Math.max(Number(platformFee) || 0, 0);
  const tax = Math.max(Number(taxAmount) || 0, 0);

  const taxableServiceAmount = roundMoney(
    Math.max(base - discount, 0)
  );

  const grossAmount = roundMoney(
    taxableServiceAmount + fee + tax
  );

  const commission = await calculateCommission({
    serviceType,
    grossAmount: taxableServiceAmount,
  });

  return {
    baseAmount: roundMoney(base),
    discountAmount: roundMoney(discount),
    platformFee: roundMoney(fee),
    taxAmount: roundMoney(tax),
    grossAmount,
    commissionPercentage:
      commission.commissionPercentage,
    commissionAmount:
      commission.commissionAmount,
    netAmount: commission.netAmount,
    customerPayable: grossAmount,
  };
};

module.exports = {
  roundMoney,
  calculateCommission,
  calculatePerMinuteBilling,
  calculateBookingBilling,
};