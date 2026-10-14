const Vendor = require("../models/Vendor");
const { applyLocation } = require("../controllers/instantController");

const lastUpdate = new Map(); // userId -> ts (throttle)

/**
 * Live pandit location for instant bookings.
 * Client emits:  vendor:location  { latitude, longitude, heading }
 * Customer gets: tracking:update  (emitted by instantController.applyLocation)
 */
module.exports = (io, socket) => {
  if (socket.user.role !== "pandit") return;

  socket.on("vendor:location", async (data = {}) => {
    try {
      const key = String(socket.user.id);
      const now = Date.now();
      if (now - (lastUpdate.get(key) || 0) < 1500) return;
      lastUpdate.set(key, now);

      const vendor = await Vendor.findOne({ user: socket.user.id, role: "pandit", status: "approved" })
        .select("_id activeInstantRequest");
      if (!vendor) return;
      await applyLocation(vendor, data);
    } catch (e) {
      console.error("vendor:location error:", e.message);
    }
  });

  socket.on("disconnect", () => lastUpdate.delete(String(socket.user.id)));
};
