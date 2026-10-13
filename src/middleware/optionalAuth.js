/**
 * Like auth, but never rejects: attaches req.user when a valid Bearer token is present.
 * Used on public catalog endpoints so they can add personal data (e.g. "is wishlisted").
 */
const User = require("../models/User");
const { verify } = require("../utils/auth");

module.exports = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) {
      const payload = verify(header.slice(7));
      const user = await User.findById(payload.id);
      if (user && user.status !== "suspended") req.user = user;
    }
  } catch (_) {
    /* ignore: treated as a guest */
  }
  next();
};
