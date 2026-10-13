const mongoose = require("mongoose");

/**
 * User.phone used to be "unique + required". Accounts created with Google start without a phone, so the
 * unique index must ignore documents that have no phone. This drops the old index once and creates the new one.
 */
const ensureUserIndexes = async () => {
  try {
    const User = require("../models/User");
    const indexes = await User.collection.indexes().catch(() => []);
    const old = indexes.find((i) => i.name === "phone_1" && !i.partialFilterExpression);
    if (old) {
      await User.collection.dropIndex("phone_1");
      console.log("Migrated users.phone index (now unique only when a phone exists)");
    }
    const oldGoogle = indexes.find((i) => i.name === "googleId_1" && !i.partialFilterExpression);
    if (oldGoogle) await User.collection.dropIndex("googleId_1");
    await User.createIndexes();
  } catch (e) {
    console.error("User index setup failed:", e.message);
  }
};

module.exports = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");
  await ensureUserIndexes();
};

module.exports.ensureUserIndexes = ensureUserIndexes;
