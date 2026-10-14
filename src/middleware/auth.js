const User = require("../models/User");
const { verify } = require("../utils/auth");

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization required" });
    }
    const payload = verify(header.slice(7));
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    if (user.status === "suspended") {
      return res.status(403).json({ success: false, message: "Your account is suspended" });
    }
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
