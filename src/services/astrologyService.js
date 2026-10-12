const axios = require("axios");

const NAVAMSHA_API_URL =
  process.env.NAVAMSHA_API_URL ||
  "https://api.navamsha.in";

const NAVAMSHA_API_KEY =
  process.env.NAVAMSHA_API_KEY;

const parseDate = (dateOfBirth) => {
  const parts = String(dateOfBirth || "").split("-");

  if (parts.length !== 3) {
    throw new Error(
      "dateOfBirth must be in YYYY-MM-DD format"
    );
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const date = Number(parts[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(date)
  ) {
    throw new Error(
      "Invalid date of birth"
    );
  }

  return {
    year,
    month,
    date,
  };
};

const parseTime = (timeOfBirth) => {
  const parts = String(
    timeOfBirth || "00:00:00"
  ).split(":");

  const hours = Number(parts[0] || 0);
  const minutes = Number(parts[1] || 0);
  const seconds = Number(parts[2] || 0);

  if (
    !Number.isInteger(hours) ||
    hours < 0 ||
    hours > 23
  ) {
    throw new Error("Invalid birth hour");
  }

  if (
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Invalid birth minute");
  }

  if (
    !Number.isInteger(seconds) ||
    seconds < 0 ||
    seconds > 59
  ) {
    throw new Error("Invalid birth second");
  }

  return {
    hours,
    minutes,
    seconds,
  };
};

const normalizeTimezone = (timezone) => {
  if (
    timezone === null ||
    timezone === undefined ||
    timezone === ""
  ) {
    return 5.5;
  }

  const numeric = Number(timezone);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const timezoneMap = {
    "Asia/Kolkata": 5.5,
    "Asia/Calcutta": 5.5,
    "Asia/Dubai": 4,
    "Asia/Singapore": 8,
    "Asia/Tokyo": 9,
    "Europe/London": 0,
    "Europe/Paris": 1,
    "America/New_York": -5,
    "America/Chicago": -6,
    "America/Denver": -7,
    "America/Los_Angeles": -8,
  };

  return timezoneMap[timezone] ?? 5.5;
};

const generateKundli = async ({
  dateOfBirth,
  timeOfBirth,
  latitude,
  longitude,
  timezone,
}) => {
  if (!NAVAMSHA_API_KEY) {
    const error = new Error(
      "NAVAMSHA_API_KEY is missing"
    );

    error.status = 500;

    throw error;
  }

  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (
    !Number.isFinite(parsedLatitude) ||
    !Number.isFinite(parsedLongitude)
  ) {
    const error = new Error(
      "Valid latitude and longitude are required"
    );

    error.status = 400;

    throw error;
  }

  if (
    parsedLatitude < -90 ||
    parsedLatitude > 90
  ) {
    const error = new Error(
      "Latitude must be between -90 and 90"
    );

    error.status = 400;

    throw error;
  }

  if (
    parsedLongitude < -180 ||
    parsedLongitude > 180
  ) {
    const error = new Error(
      "Longitude must be between -180 and 180"
    );

    error.status = 400;

    throw error;
  }

  const {
    year,
    month,
    date,
  } = parseDate(dateOfBirth);

  const {
    hours,
    minutes,
    seconds,
  } = parseTime(timeOfBirth);

  const payload = {
    year,
    month,
    date,
    hours,
    minutes,
    seconds,

    latitude: parsedLatitude,
    longitude: parsedLongitude,

    timezone:
      normalizeTimezone(timezone),

    settings: {
      observation_point: "topocentric",
      ayanamsha: "lahiri",
      language: "en",
      node_type: "mean",
    },
  };

  try {
    const response = await axios.post(
      `${NAVAMSHA_API_URL}/api/v1/astrology/kundli/advanced`,
      payload,
      {
        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",

          "X-API-Key":
            NAVAMSHA_API_KEY,
        },

        timeout: 30000,
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Navamsha Kundli API Error:",
      error.response?.data ||
        error.message
    );

    const providerData =
      error.response?.data;

    const providerMessage =
      providerData?.detail ||
      providerData?.message ||
      "Failed to generate Kundli";

    const apiError = new Error(
      typeof providerMessage ===
        "string"
        ? providerMessage
        : "Navamsha API request failed"
    );

    apiError.status =
      error.response?.status || 502;

    apiError.details =
      providerData || null;

    throw apiError;
  }
};

const getHoroscope = async ({
  zodiacSign,
  period = "daily",
  date,
}) => {
  if (!NAVAMSHA_API_KEY) {
    const error = new Error(
      "NAVAMSHA_API_KEY is missing"
    );

    error.status = 500;

    throw error;
  }

  /*
    Exact horoscope provider endpoint
    abhi configured nahi hai.

    Isliye fake horoscope data generate
    nahi kar rahe.
  */

  const error = new Error(
    "Horoscope provider integration is not configured yet"
  );

  error.status = 501;

  error.details = {
    zodiacSign,
    period,
    date,
  };

  throw error;
};

module.exports = {
  generateKundli,
  getHoroscope,
};