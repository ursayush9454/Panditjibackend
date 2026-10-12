
const axios = require("axios");

const API_URL =
  "https://api.astroway.info/v1/public/horoscope/daily";

const VALID_SIGNS = [
  "aries", "taurus", "gemini", "cancer",
  "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces",
];

async function fetchDailyHoroscope(zodiacSign, date) {
  const sign = String(zodiacSign).toLowerCase();

  if (!VALID_SIGNS.includes(sign)) {
    throw new Error(`Invalid zodiac sign: ${sign}`);
  }

  const response = await axios.get(API_URL, {
    params: { sign },
    timeout: 20000,
    headers: { Accept: "application/json" },
  });

  const result = response.data;

  if (result?.ok !== true || !result.data?.sections) {
    throw new Error(`Invalid horoscope response for ${sign}`);
  }

  const data = result.data;
  const sections = data.sections;

  if (!sections.overview) {
    throw new Error(`Missing overview for ${sign}`);
  }

  // Provider currently returns Ukrainian (language: uk).
  // Save the actual returned language; don't label it as Hindi.
  return {
    zodiacSign: sign,
    date: data.date || date,
    period: "daily",
    content: {
      overall: sections.overview || "",
      love: sections.love || "",
      career: sections.career || "",
      finance: sections.finance || "",
      health: sections.health || "",
      family: sections.advice || "",
    },
    luckyNumber: data.lucky?.number != null
      ? String(data.lucky.number)
      : "",
    luckyColor: "",
    provider: "astroway-public",
  };
}

module.exports = {
  fetchDailyHoroscope,
  VALID_SIGNS,
};
