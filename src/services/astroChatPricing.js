/**
 * Pure pricing helpers for paid astrologer chat (no DB, easy to unit test).
 *
 * Example: rate = 10/min, commission = 50%  ->  user pays 10, astrologer gets 5, admin keeps 5.
 */

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Returns a number between 0 and 100, or null when the value is empty / invalid.
const toPercent = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

// First valid percentage wins: per-astrologer override -> global admin setting -> fallback.
const resolveCommissionPercent = (...candidates) => {
  for (const candidate of candidates) {
    const percent = toPercent(candidate);
    if (percent !== null) return percent;
  }
  return 20;
};

// Splits ONE minute's rate into astrologer share + admin commission.
// astrologer is derived by subtraction so commission + astrologer always equals gross exactly.
const splitAmount = (ratePerMinute, commissionPercent) => {
  const gross = roundMoney(ratePerMinute);
  if (!(gross > 0)) throw new Error("Rate per minute must be greater than zero");

  const percent = toPercent(commissionPercent);
  if (percent === null) throw new Error("Commission percent must be between 0 and 100");

  const commission = roundMoney((gross * percent) / 100);
  const astrologer = roundMoney(gross - commission);

  return { gross, commission, astrologer, commissionPercent: percent };
};

module.exports = { roundMoney, toPercent, resolveCommissionPercent, splitAmount };
