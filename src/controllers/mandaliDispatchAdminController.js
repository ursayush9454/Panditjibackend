const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const MandaliDispatchSettings = require("../models/MandaliDispatchSettings");

const DEFAULTS = { radiusKm: 5, offerTimeoutSeconds: 120 };

async function getOrCreateSettings() {
  return MandaliDispatchSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default", priorityVendorIds: [], ...DEFAULTS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const sortVendors = (vendors, orderedIds) => {
  const index = new Map((orderedIds || []).map((id, i) => [String(id), i]));
  return vendors.sort((a, b) => {
    const aIndex = index.has(String(a._id)) ? index.get(String(a._id)) : Number.MAX_SAFE_INTEGER;
    const bIndex = index.has(String(b._id)) ? index.get(String(b._id)) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const vendors = await Vendor.find({ role: "mandali", status: "approved" })
      .select("_id user name phone city state status isOnline location serviceRadiusKm")
      .lean();

    return res.json({
      success: true,
      settings: {
        radiusKm: DEFAULTS.radiusKm,
        offerTimeoutSeconds: DEFAULTS.offerTimeoutSeconds,
        priorityVendorIds: (settings.priorityVendorIds || []).map(String),
        ordering: "listed vendors first in the supplied order; all others nearest-first",
      },
      mandalis: sortVendors(vendors, (settings.priorityVendorIds || []).map(String)),
    });
  } catch (error) {
    console.error("Get Mandali Dispatch Settings Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch Mandali dispatch settings" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const supplied = req.body?.priorityVendorIds;
    if (!Array.isArray(supplied)) {
      return res.status(400).json({
        success: false,
        message: "priorityVendorIds must be an ordered array of approved Mandali vendor IDs. Send [] to use nearest-first ordering.",
      });
    }
    if (supplied.length > 500 || supplied.some((id) => !mongoose.Types.ObjectId.isValid(String(id)))) {
      return res.status(400).json({ success: false, message: "priorityVendorIds contains an invalid ID or too many entries" });
    }

    const ids = supplied.map(String);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ success: false, message: "priorityVendorIds cannot contain duplicate IDs" });
    }

    if (ids.length) {
      const vendors = await Vendor.find({
        _id: { $in: ids },
        role: "mandali",
        status: "approved",
      }).select("_id").lean();
      const valid = new Set(vendors.map((item) => String(item._id)));
      const invalid = ids.filter((id) => !valid.has(id));
      if (invalid.length) {
        return res.status(400).json({
          success: false,
          message: "Every priority ID must belong to an approved Mandali vendor",
          invalidVendorIds: invalid,
        });
      }
    }

    const settings = await MandaliDispatchSettings.findOneAndUpdate(
      { key: "default" },
      {
        $set: {
          priorityVendorIds: ids,
          radiusKm: DEFAULTS.radiusKm,
          offerTimeoutSeconds: DEFAULTS.offerTimeoutSeconds,
          updatedBy: req.user?._id || req.user?.id || null,
        },
        $setOnInsert: { key: "default" },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      message: "Mandali dispatch order updated. New requests will use this order; existing requests keep their saved order.",
      settings: {
        radiusKm: DEFAULTS.radiusKm,
        offerTimeoutSeconds: DEFAULTS.offerTimeoutSeconds,
        priorityVendorIds: (settings.priorityVendorIds || []).map(String),
      },
    });
  } catch (error) {
    console.error("Update Mandali Dispatch Settings Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update Mandali dispatch settings" });
  }
};
