
const axios = require("axios");

const API_URL =
  "https://api.navamsha.in/api/v1/compatibility/ashtakoot";

const validatePerson = (person, label) => {
  if (!person || typeof person !== "object") {
    throw new Error(`${label} details are required`);
  }

  const { dateOfBirth, timeOfBirth, latitude, longitude, timezone } =
    person;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateOfBirth || ""))) {
    throw new Error(`${label}: dateOfBirth must be YYYY-MM-DD`);
  }

  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new Error(`${label}: invalid dateOfBirth`);
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(timeOfBirth || ""))) {
    throw new Error(`${label}: timeOfBirth must be HH:mm`);
  }

  if (
    latitude === undefined ||
    longitude === undefined ||
    timezone === undefined ||
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude)) ||
    !Number.isFinite(Number(timezone))
  ) {
    throw new Error(
      `${label}: valid latitude, longitude and timezone are required`
    );
  }

  if (Number(latitude) < -90 || Number(latitude) > 90) {
    throw new Error(`${label}: latitude must be between -90 and 90`);
  }

  if (Number(longitude) < -180 || Number(longitude) > 180) {
    throw new Error(`${label}: longitude must be between -180 and 180`);
  }

  if (Number(timezone) < -12 || Number(timezone) > 14) {
    throw new Error(`${label}: timezone is outside the supported range`);
  }

  const [hours, minutes] = timeOfBirth.split(":").map(Number);

  return {
    name: String(person.name || label).trim(),
    year,
    month,
    date: day,
    hours,
    minutes,
    latitude: Number(latitude),
    longitude: Number(longitude),
    timezone: Number(timezone),
  };
};

async function matchKundli(brideInput, groomInput) {
  const apiKey = process.env.NAVAMSHA_API_KEY;

  if (!apiKey) {
    throw new Error("NAVAMSHA_API_KEY is missing in .env");
  }

  const bride = validatePerson(brideInput, "Bride");
  const groom = validatePerson(groomInput, "Groom");

  try {
    const response = await axios.post(
      API_URL,
      {
        bride: {
          year: bride.year,
          month: bride.month,
          date: bride.date,
          hours: bride.hours,
          minutes: bride.minutes,
          latitude: bride.latitude,
          longitude: bride.longitude,
          timezone: bride.timezone,
        },
        groom: {
          year: groom.year,
          month: groom.month,
          date: groom.date,
          hours: groom.hours,
          minutes: groom.minutes,
          latitude: groom.latitude,
          longitude: groom.longitude,
          timezone: groom.timezone,
        },
      },
      {
        timeout: 20000,
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    const output = response.data?.output;

    if (
      response.data?.statusCode !== 200 ||
      !output ||
      typeof output.total_score !== "number"
    ) {
      throw new Error("Invalid response from Kundli matching provider");
    }

    return {
      bride: {
        name: bride.name,
        ...output.bride,
      },
      groom: {
        name: groom.name,
        ...output.groom,
      },
      totalScore: output.total_score,
      maximumScore: output.maximum_score || 36,
      percentage: Number(
        ((output.total_score / (output.maximum_score || 36)) * 100).toFixed(2)
      ),
      interpretation:
        output.total_score < 18
          ? "Below the traditional 18-point threshold"
          : output.total_score < 24
          ? "Meets the traditional threshold; review the detailed results"
          : "A traditionally favourable score; review the detailed results",
      breakdown: output.breakdown || {},
      provider: "navamsha",
      disclaimer:
        "Traditional astrology-based matching is for cultural guidance and reflection, not a guaranteed prediction of relationship success. Consider personal compatibility and mutual consent too.",
    };
  } catch (error) {
    if (error.response) {
      const providerMessage =
        error.response.data?.message ||
        error.response.data?.error?.message;

      const apiError = new Error(
        providerMessage ||
          `Kundli provider returned HTTP ${error.response.status}`
      );

      apiError.statusCode =
        error.response.status >= 400 && error.response.status < 500
          ? 502
          : 503;

      throw apiError;
    }

    if (error.code === "ECONNABORTED") {
      const timeoutError = new Error(
        "Kundli matching provider timed out. Please try again."
      );
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  }
}

module.exports = { matchKundli };
