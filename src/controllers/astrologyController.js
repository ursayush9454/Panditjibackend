
const mongoose = require("mongoose");
const axios = require("axios");

const BirthProfile = require("../models/BirthProfile");
const Kundli = require("../models/Kundli");
const Horoscope = require("../models/Horoscope");
const KundliMatch = require("../models/KundliMatch");
const astrologyService = require("../services/astrologyService");

// ======================================================
// HELPERS
// ======================================================

const getUserId = (req) => req.user?.id || req.user?._id;

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const zodiacSigns = [
  "aries", "taurus", "gemini", "cancer",
  "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces",
];

const getTimezoneOffset = (timezone) => {
  if (typeof timezone === "number") return timezone;

  const numeric = Number(timezone);
  if (timezone !== "" && timezone != null && Number.isFinite(numeric)) {
    return numeric;
  }

  const offsets = {
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

  return offsets[timezone] ?? 5.5;
};

const validateBirthData = (data) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.dateOfBirth || ""))) {
    return "dateOfBirth must be in YYYY-MM-DD format";
  }

  const date = new Date(`${data.dateOfBirth}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== data.dateOfBirth
  ) {
    return "Invalid date of birth";
  }

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(data.timeOfBirth || ""))) {
    return "timeOfBirth must be in HH:mm or HH:mm:ss format";
  }

  const time = data.timeOfBirth.split(":").map(Number);
  if (
    time[0] > 23 ||
    time[1] > 59 ||
    (time.length === 3 && time[2] > 59)
  ) {
    return "Invalid time of birth";
  }

  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Valid latitude is required";
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Valid longitude is required";
  }

  return null;
};

const providerOutput = (result) =>
  result?.output || result?.data || result?.result || result || {};

const photoUrlFromRequest = (req) => {
  if (!req.file) return undefined;
  return `/uploads/${req.file.filename}`;
};

const getOwnedProfile = async (userId, profileId) => {
  if (!validId(profileId)) return null;
  return BirthProfile.findOne({ _id: profileId, user: userId });
};

// ======================================================
// CREATE BIRTH PROFILE
// POST /api/astrology/birth-profiles
// Supports multipart/form-data with optional "photo"
// ======================================================

exports.createBirthProfile = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      name,
      gender,
      dateOfBirth,
      timeOfBirth,
      birthPlace,
      birthCity,
      birthState,
      birthCountry,
      latitude,
      longitude,
      timezone,
      relation,
      isDefault,
    } = req.body;

    if (!String(name || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!String(birthPlace || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Birth place is required",
      });
    }

    const validationError = validateBirthData({
      dateOfBirth,
      timeOfBirth,
      latitude,
      longitude,
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const count = await BirthProfile.countDocuments({ user: userId });
    const makeDefault = isDefault === true || isDefault === "true" || count === 0;

    if (makeDefault) {
      await BirthProfile.updateMany(
        { user: userId, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const photoUrl = photoUrlFromRequest(req);

    const profile = await BirthProfile.create({
      user: userId,
      name: String(name).trim(),
      gender: gender || "other",
      dateOfBirth,
      timeOfBirth,
      birthPlace: String(birthPlace).trim(),
      birthCity: birthCity || "",
      birthState: birthState || "",
      birthCountry: birthCountry || "India",
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: timezone || "Asia/Kolkata",
      relation: relation || "self",
      isDefault: makeDefault,
      photoUrl: photoUrl || "",
      photoReviewStatus: photoUrl ? "pending_review" : "not_provided",
    });

    return res.status(201).json({
      success: true,
      message: "Birth profile created successfully",
      profile,
    });
  } catch (error) {
    console.error("createBirthProfile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create birth profile",
    });
  }
};

// ======================================================
// LIST MY BIRTH PROFILES
// GET /api/astrology/birth-profiles
// ======================================================

exports.getBirthProfiles = async (req, res) => {
  try {
    const profiles = await BirthProfile.find({
      user: getUserId(req),
    }).sort({ isDefault: -1, createdAt: -1 });

    return res.json({
      success: true,
      count: profiles.length,
      profiles,
    });
  } catch (error) {
    console.error("getBirthProfiles:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch birth profiles",
    });
  }
};

// ======================================================
// GET SINGLE BIRTH PROFILE
// GET /api/astrology/birth-profiles/:id
// ======================================================

exports.getBirthProfile = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile ID",
      });
    }

    const profile = await BirthProfile.findOne({
      _id: req.params.id,
      user: getUserId(req),
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Birth profile not found",
      });
    }

    return res.json({ success: true, profile });
  } catch (error) {
    console.error("getBirthProfile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch birth profile",
    });
  }
};

// ======================================================
// UPDATE BIRTH PROFILE
// PUT /api/astrology/birth-profiles/:id
// ======================================================

exports.updateBirthProfile = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile ID",
      });
    }

    const userId = getUserId(req);
    const profile = await BirthProfile.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Birth profile not found",
      });
    }

    const allowed = [
      "name",
      "gender",
      "dateOfBirth",
      "timeOfBirth",
      "birthPlace",
      "birthCity",
      "birthState",
      "birthCountry",
      "latitude",
      "longitude",
      "timezone",
      "relation",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (["latitude", "longitude"].includes(key)) {
          profile[key] = Number(req.body[key]);
        } else if (typeof req.body[key] === "string") {
          profile[key] = req.body[key].trim();
        } else {
          profile[key] = req.body[key];
        }
      }
    }

    const validationError = validateBirthData(profile);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    if (req.file) {
      profile.photoUrl = photoUrlFromRequest(req);
      profile.photoReviewStatus = "pending_review";
    }

    if (req.body.isDefault === true || req.body.isDefault === "true") {
      await BirthProfile.updateMany(
        { user: userId, _id: { $ne: profile._id } },
        { $set: { isDefault: false } }
      );
      profile.isDefault = true;
    }

    await profile.save();

    return res.json({
      success: true,
      message: "Birth profile updated successfully",
      profile,
    });
  } catch (error) {
    console.error("updateBirthProfile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update birth profile",
    });
  }
};

// ======================================================
// DELETE BIRTH PROFILE
// DELETE /api/astrology/birth-profiles/:id
// ======================================================

exports.deleteBirthProfile = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile ID",
      });
    }

    const profile = await BirthProfile.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Birth profile not found",
      });
    }

    await BirthProfile.deleteOne({ _id: profile._id });

    if (profile.isDefault) {
      const next = await BirthProfile.findOne({ user: userId }).sort({
        createdAt: -1,
      });

      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    return res.json({
      success: true,
      message: "Birth profile deleted successfully",
    });
  } catch (error) {
    console.error("deleteBirthProfile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete birth profile",
    });
  }
};

// ======================================================
// SET DEFAULT PROFILE
// PUT /api/astrology/birth-profiles/:id/default
// ======================================================

exports.setDefaultProfile = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile ID",
      });
    }

    const profile = await BirthProfile.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Birth profile not found",
      });
    }

    await BirthProfile.updateMany(
      { user: userId },
      { $set: { isDefault: false } }
    );

    profile.isDefault = true;
    await profile.save();

    return res.json({
      success: true,
      message: "Default profile updated",
      profile,
    });
  } catch (error) {
    console.error("setDefaultProfile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to set default profile",
    });
  }
};

// ======================================================
// GENERATE KUNDLI
// POST /api/astrology/kundli/generate
// Body: { "birthProfileId": "..." }
// ======================================================

exports.generateKundli = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { birthProfileId } = req.body;

    if (!validId(birthProfileId)) {
      return res.status(400).json({
        success: false,
        message: "Valid birthProfileId is required",
      });
    }

    const profile = await getOwnedProfile(userId, birthProfileId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Birth profile not found",
      });
    }

    const validationError = validateBirthData(profile);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const result = await astrologyService.generateKundli({
      dateOfBirth: profile.dateOfBirth,
      timeOfBirth: profile.timeOfBirth,
      latitude: profile.latitude,
      longitude: profile.longitude,
      timezone: getTimezoneOffset(profile.timezone),
    });

    if (!result) {
      return res.status(502).json({
        success: false,
        message: "Empty response from astrology provider",
      });
    }

    if (
      result.statusCode !== undefined &&
      ![0, 200].includes(Number(result.statusCode))
    ) {
      return res.status(502).json({
        success: false,
        message: "Astrology provider returned an error",
      });
    }

    const output = providerOutput(result);

    const kundli = await Kundli.create({
      user: userId,
      birthProfile: profile._id,
      lagna: output.lagna || output.ascendant || {},
      ascendant: output.ascendant || output.lagna || null,
      moonSign: output.moonSign || output.moon_sign || output.moonRashi || "",
      sunSign: output.sunSign || output.sun_sign || output.sunRashi || "",
      nakshatra: output.nakshatra || output.birthNakshatra || {},
      planets:
        output.planets ||
        output.planetary_positions ||
        output.planetaryPositions ||
        [],
      houses:
        output.houses ||
        output.house_positions ||
        output.housePositions ||
        [],
      dasha: output.dasha || output.dashas || output.vimshottari_dasha || {},
      doshas: output.doshas || {
        manglik: Boolean(
          output.mangal_dosha || output.mangalDosha || output.manglik
        ),
      },
      navamsha: output.navamsha || output.navamsa || output.d9 || null,
      yogas: output.yogas || output.yoga || [],
      charts: output.charts || null,
      calculations: output.calculations || null,
      rawData: result,
      provider: "navamsha",
      providerStatusCode:
        result.statusCode !== undefined ? Number(result.statusCode) : null,
      generatedAt: new Date(),
      lastRegeneratedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Kundli generated successfully",
      kundli,
      astrology: output,
    });
  } catch (error) {
    console.error(
      "generateKundli:",
      error.response?.data || error.message
    );

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to generate kundli",
      details:
        process.env.NODE_ENV === "development"
          ? error.response?.data
          : undefined,
    });
  }
};

// ======================================================
// LIST MY KUNDLIS
// GET /api/astrology/kundli
// ======================================================

exports.getMyKundlis = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = { user: getUserId(req) };

    if (req.query.birthProfileId) {
      if (!validId(req.query.birthProfileId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid birthProfileId",
        });
      }
      filter.birthProfile = req.query.birthProfileId;
    }

    const [kundlis, total] = await Promise.all([
      Kundli.find(filter)
        .populate("birthProfile")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Kundli.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      count: kundlis.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      kundlis,
    });
  } catch (error) {
    console.error("getMyKundlis:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch kundlis",
    });
  }
};

// ======================================================
// GET SINGLE KUNDLI
// GET /api/astrology/kundli/:id
// ======================================================

exports.getKundli = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid kundli ID",
      });
    }

    const kundli = await Kundli.findOne({
      _id: req.params.id,
      user: getUserId(req),
    }).populate("birthProfile");

    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    return res.json({ success: true, kundli });
  } catch (error) {
    console.error("getKundli:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch kundli",
    });
  }
};

// ======================================================
// REGENERATE KUNDLI
// POST /api/astrology/kundli/:id/regenerate
// ======================================================

exports.regenerateKundli = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid kundli ID",
      });
    }

    const kundli = await Kundli.findOne({
      _id: req.params.id,
      user: getUserId(req),
    }).populate("birthProfile");

    if (!kundli || !kundli.birthProfile) {
      return res.status(404).json({
        success: false,
        message: "Kundli or birth profile not found",
      });
    }

    const profile = kundli.birthProfile;
    const validationError = validateBirthData(profile);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const result = await astrologyService.generateKundli({
      dateOfBirth: profile.dateOfBirth,
      timeOfBirth: profile.timeOfBirth,
      latitude: profile.latitude,
      longitude: profile.longitude,
      timezone: getTimezoneOffset(profile.timezone),
    });

    if (
      !result ||
      (result.statusCode !== undefined &&
        ![0, 200].includes(Number(result.statusCode)))
    ) {
      return res.status(502).json({
        success: false,
        message: "Astrology provider returned an error",
      });
    }

    const output = providerOutput(result);

    kundli.lagna = output.lagna || output.ascendant || {};
    kundli.ascendant = output.ascendant || output.lagna || null;
    kundli.moonSign = output.moonSign || output.moon_sign || output.moonRashi || "";
    kundli.sunSign = output.sunSign || output.sun_sign || output.sunRashi || "";
    kundli.nakshatra = output.nakshatra || output.birthNakshatra || {};
    kundli.planets =
      output.planets ||
      output.planetary_positions ||
      output.planetaryPositions ||
      [];
    kundli.houses =
      output.houses ||
      output.house_positions ||
      output.housePositions ||
      [];
    kundli.dasha = output.dasha || output.dashas || output.vimshottari_dasha || {};
    kundli.doshas = output.doshas || {
      manglik: Boolean(output.mangal_dosha || output.mangalDosha || output.manglik),
    };
    kundli.navamsha = output.navamsha || output.navamsa || output.d9 || null;
    kundli.yogas = output.yogas || output.yoga || [];
    kundli.charts = output.charts || null;
    kundli.calculations = output.calculations || null;
    kundli.rawData = result;
    kundli.provider = "navamsha";
    kundli.providerStatusCode =
      result.statusCode !== undefined ? Number(result.statusCode) : null;
    kundli.generatedAt = new Date();
    kundli.lastRegeneratedAt = new Date();

    await kundli.save();

    return res.json({
      success: true,
      message: "Kundli regenerated successfully",
      kundli,
      astrology: output,
    });
  } catch (error) {
    console.error(
      "regenerateKundli:",
      error.response?.data || error.message
    );
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to regenerate kundli",
    });
  }
};

// ======================================================
// DELETE KUNDLI
// DELETE /api/astrology/kundli/:id
// ======================================================

exports.deleteKundli = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid kundli ID",
      });
    }

    const kundli = await Kundli.findOne({
      _id: req.params.id,
      user: getUserId(req),
    });

    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    await Kundli.deleteOne({ _id: kundli._id });

    return res.json({
      success: true,
      message: "Kundli deleted successfully",
    });
  } catch (error) {
    console.error("deleteKundli:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete kundli",
    });
  }
};

// ======================================================
// GET HOROSCOPE
// GET /api/astrology/horoscope?zodiacSign=aries
// ======================================================

exports.getHoroscope = async (req, res) => {
  try {
    const zodiacSign = String(req.query.zodiacSign || "").toLowerCase().trim();
    const period = String(req.query.period || "daily").toLowerCase().trim();
    const date = String(
      req.query.date || new Date().toISOString().slice(0, 10)
    );

    if (!zodiacSigns.includes(zodiacSign)) {
      return res.status(400).json({
        success: false,
        message: "A valid zodiacSign is required",
      });
    }

    if (!["daily", "weekly", "monthly", "yearly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid horoscope period",
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date must be YYYY-MM-DD",
      });
    }

    const horoscope = await Horoscope.findOne({
      zodiacSign,
      date,
      period,
    }).lean();

    if (!horoscope) {
      return res.status(404).json({
        success: false,
        message: "Horoscope has not been published for this date",
        zodiacSign,
        date,
        period,
      });
    }

    return res.json({ success: true, horoscope });
  } catch (error) {
    console.error("getHoroscope:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch horoscope",
    });
  }
};

// ======================================================
// ADMIN PUBLISH / UPDATE HOROSCOPE
// POST /api/astrology/horoscope/publish
// ======================================================

exports.publishHoroscope = async (req, res) => {
  try {
    const zodiacSign = String(req.body.zodiacSign || "").toLowerCase().trim();
    const period = String(req.body.period || "daily").toLowerCase().trim();
    const date = String(
      req.body.date || new Date().toISOString().slice(0, 10)
    );

    if (!zodiacSigns.includes(zodiacSign)) {
      return res.status(400).json({
        success: false,
        message: "Invalid zodiacSign",
      });
    }

    if (!["daily", "weekly", "monthly", "yearly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid horoscope period",
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date must be YYYY-MM-DD",
      });
    }

    const content = req.body.content || {};

    const horoscope = await Horoscope.findOneAndUpdate(
      { zodiacSign, date, period },
      {
        $set: {
          zodiacSign,
          date,
          period,
          content,
          luckyNumber: String(req.body.luckyNumber || ""),
          luckyColor: String(req.body.luckyColor || ""),
          rating: req.body.rating ?? null,
          provider: "admin",
        },
        $setOnInsert: { user: null },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message: "Horoscope published successfully",
      horoscope,
    });
  } catch (error) {
    console.error("publishHoroscope:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to publish horoscope",
    });
  }
};

// ======================================================
// KUNDLI MATCHING HELPERS
// ======================================================

const toProviderBirth = (person) => {
  const validationError = validateBirthData(person);
  if (validationError) {
    throw Object.assign(new Error(validationError), { status: 400 });
  }

  const dateParts = person.dateOfBirth.split("-").map(Number);
  const timeParts = person.timeOfBirth.split(":").map(Number);

  return {
    year: dateParts[0],
    month: dateParts[1],
    date: dateParts[2],
    hours: timeParts[0],
    minutes: timeParts[1],
    seconds: timeParts[2] || 0,
    latitude: Number(person.latitude),
    longitude: Number(person.longitude),
    timezone: getTimezoneOffset(person.timezone || "Asia/Kolkata"),
  };
};

// ======================================================
// MATCH TWO KUNDLIS
// POST /api/astrology/kundli/matching
// ======================================================

exports.matchKundli = async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      bride,
      groom,
      brideProfileId,
      groomProfileId,
    } = req.body || {};

    let brideData = bride;
    let groomData = groom;

    if (brideProfileId) {
      const profile = await getOwnedProfile(userId, brideProfileId);
      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Bride birth profile not found",
        });
      }
      brideData = profile.toObject();
    }

    if (groomProfileId) {
      const profile = await getOwnedProfile(userId, groomProfileId);
      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Groom birth profile not found",
        });
      }
      groomData = profile.toObject();
    }

    if (!brideData || !groomData) {
      return res.status(400).json({
        success: false,
        message: "Provide bride and groom details or their saved profile IDs",
      });
    }

    if (!process.env.NAVAMSHA_API_KEY) {
      return res.status(503).json({
        success: false,
        message: "NAVAMSHA_API_KEY is not configured",
      });
    }

    const bridePayload = toProviderBirth(brideData);
    const groomPayload = toProviderBirth(groomData);

    const baseUrl = (
      process.env.NAVAMSHA_API_URL || "https://api.navamsha.in"
    ).replace(/\/$/, "");

    const response = await axios.post(
      `${baseUrl}/api/v1/compatibility/ashtakoot`,
      {
        bride: bridePayload,
        groom: groomPayload,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-Key": process.env.NAVAMSHA_API_KEY,
        },
        timeout: 30000,
      }
    );

    const providerResult = response.data;

    if (
      providerResult?.statusCode !== undefined &&
      ![0, 200].includes(Number(providerResult.statusCode))
    ) {
      return res.status(502).json({
        success: false,
        message: "Astrology provider returned an error",
      });
    }

    const output = providerOutput(providerResult);

    const match = await KundliMatch.create({
      user: userId,
      bride: {
        name: String(brideData.name || "Bride"),
        birthProfile: brideProfileId || null,
        photoUrl: String(brideData.photoUrl || ""),
      },
      groom: {
        name: String(groomData.name || "Groom"),
        birthProfile: groomProfileId || null,
        photoUrl: String(groomData.photoUrl || ""),
      },
      totalScore: Number(output.total_score ?? output.totalScore ?? 0),
      maximumScore: Number(output.maximum_score ?? output.maximumScore ?? 36),
      result: output,
      provider: "navamsha",
    });

    return res.status(201).json({
      success: true,
      message: "Kundli matching completed",
      match,
    });
  } catch (error) {
    console.error(
      "matchKundli:",
      error.response?.data || error.message
    );

    return res.status(error.status || 502).json({
      success: false,
      message: error.message || "Kundli matching failed",
      details:
        process.env.NODE_ENV === "development"
          ? error.response?.data
          : undefined,
    });
  }
};

// ======================================================
// MY KUNDLI MATCHING HISTORY
// GET /api/astrology/kundli/matching
// ======================================================

exports.getMyKundliMatches = async (req, res) => {
  try {
    const matches = await KundliMatch.find({
      user: getUserId(req),
    })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({
      success: true,
      count: matches.length,
      matches,
    });
  } catch (error) {
    console.error("getMyKundliMatches:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch kundli matching history",
    });
  }
};
