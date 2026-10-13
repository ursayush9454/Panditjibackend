/**
 * Daily horoscope provider client.
 *
 * Config (.env)
 *   HOROSCOPE_LANGUAGE=hi | en            language the app wants (default hi)
 *   HOROSCOPE_PROVIDER_URL=...            default: astroway public daily endpoint
 *   HOROSCOPE_API_KEY=                    optional, sent as X-API-Key
 *   HOROSCOPE_LANG_PARAM=lang             query-string name the provider uses for language
 *   FREE_HOROSCOPE_API_URL=https://freehoroscopeapi.com/api/v1
 *                                         when set, this provider is used (English text only,
 *                                         no API key). Leave empty to use the providers above.
 *
 * The old version saved whatever the provider returned, which was Ukrainian, and labelled it
 * as Hindi. Now the text language is CHECKED before saving: wrong-language content is rejected
 * (the job logs it, nothing bad is stored) and the admin can publish manually or you can point
 * HOROSCOPE_PROVIDER_URL to a provider that really supports Hindi/English.
 */
const axios = require("axios");

const DEFAULT_URL = "https://api.astroway.info/v1/public/horoscope/daily";

const VALID_SIGNS = [
  "aries", "taurus", "gemini", "cancer",
  "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces",
];

const targetLanguage = () => String(process.env.HOROSCOPE_LANGUAGE || "hi").toLowerCase().slice(0, 2);

/**
 * Checks the script of `text` against the wanted language.
 *  hi -> mostly Devanagari      en -> mostly Latin
 * Digits, spaces and punctuation are ignored. Very short text always passes.
 */
const matchesLanguage = (text, lang) => {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  if (letters.length < 12) return true;
  const count = (re) => letters.filter((ch) => re.test(ch)).length;
  const devanagari = count(/[\u0900-\u097F]/) / letters.length;
  const latin = count(/[A-Za-z]/) / letters.length;
  if (lang === "hi") return devanagari >= 0.6;
  if (lang === "en") return latin >= 0.8;
  return true; // unknown language code: do not block
};

// Shift a YYYY-MM-DD string by `days` (pure calendar math, no timezone involved).
const shiftDate = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * freehoroscopeapi.com
 *   GET {FREE_HOROSCOPE_API_URL}/get-horoscope/daily?sign=aries
 *   -> { data: { date, period, sign, horoscope } }
 * It returns one English paragraph, so it is stored as content.overall (other sections stay empty).
 */
async function fetchFromFreeHoroscopeApi(sign, date) {
  const baseUrl = String(process.env.FREE_HOROSCOPE_API_URL).trim().replace(/\/+$/, "");

  const response = await axios.get(`${baseUrl}/get-horoscope/daily`, {
    params: { sign },
    timeout: 20000,
    headers: { Accept: "application/json" },
  });

  const data = response.data?.data;
  const text = typeof data?.horoscope === "string" ? data.horoscope.trim() : "";
  if (!text) throw new Error(`Invalid horoscope response for ${sign}`);

  // The provider is English only: reject anything else instead of saving it.
  if (!matchesLanguage(text, "en")) {
    throw new Error(`Provider returned non-English text for ${sign}. Not saved.`);
  }

  // The provider's "today" may be the UTC date while the job runs in IST (5 AM IST is still
  // yesterday in UTC). Accept +-1 day and store under the requested India date.
  const resolvedDate = date;
  if (data.date && data.date !== date) {
    if (data.date !== shiftDate(date, -1) && data.date !== shiftDate(date, 1)) {
      throw new Error(`Provider date mismatch: expected ${date}, received ${data.date}`);
    }
  }

  return {
    zodiacSign: sign,
    date: resolvedDate,
    period: "daily",
    content: { overall: text, love: "", career: "", finance: "", health: "", family: "" },
    luckyNumber: "",
    luckyColor: "",
    provider: "freehoroscopeapi",
    language: "en",
  };
}

async function fetchDailyHoroscope(zodiacSign, date) {
  const sign = String(zodiacSign).toLowerCase();
  if (!VALID_SIGNS.includes(sign)) throw new Error(`Invalid zodiac sign: ${sign}`);

  if (process.env.FREE_HOROSCOPE_API_URL && process.env.FREE_HOROSCOPE_API_URL.trim()) {
    return fetchFromFreeHoroscopeApi(sign, date);
  }

  const lang = targetLanguage();
  const langParam = process.env.HOROSCOPE_LANG_PARAM || "lang";

  const response = await axios.get(process.env.HOROSCOPE_PROVIDER_URL || DEFAULT_URL, {
    params: { sign, [langParam]: lang },
    timeout: 20000,
    headers: {
      Accept: "application/json",
      ...(process.env.HOROSCOPE_API_KEY ? { "X-API-Key": process.env.HOROSCOPE_API_KEY } : {}),
    },
  });

  const result = response.data;
  if (result?.ok !== true || !result.data?.sections) {
    throw new Error(`Invalid horoscope response for ${sign}`);
  }

  const data = result.data;
  const sections = data.sections;
  if (!sections.overview) throw new Error(`Missing overview for ${sign}`);

  if (!matchesLanguage(sections.overview, lang)) {
    throw new Error(
      `Provider returned text in a different language than HOROSCOPE_LANGUAGE=${lang} for ${sign}. ` +
        "Not saved. Use a provider that supports this language or publish it from the admin API."
    );
  }

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
    luckyNumber: data.lucky?.number != null ? String(data.lucky.number) : "",
    luckyColor: data.lucky?.color ? String(data.lucky.color) : "",
    provider: "astroway-public",
    language: lang,
  };
}

module.exports = { fetchDailyHoroscope, matchesLanguage, VALID_SIGNS };
