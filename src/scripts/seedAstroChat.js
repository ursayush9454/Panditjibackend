/**
 * Dummy data for paid astrologer chat.   Run:  npm run seed:astro
 *
 * Creates (safe to run many times):
 *   - 2 approved + online astrologers (login with OTP on these phones)
 *   - 1 demo customer with Rs 500 wallet balance (credited only once)
 *
 * Admin decides the price: ratePerMinute = what USER pays, commissionPercent = admin's cut.
 *   Astro 1:  Rs 10/min, 50% commission  -> user pays 10, astrologer gets 5, admin gets 5
 *   Astro 2:  Rs 15/min, 40% commission  -> user pays 15, astrologer gets 9, admin gets 6
 *
 * Needs MongoDB replica set (wallet uses transactions) - same as the rest of the project.
 */
require("dotenv").config();

const mongoose = require("mongoose");

const User = require("../models/User");
const Vendor = require("../models/Vendor");
const { creditWallet } = require("../services/walletService");
const { splitAmount } = require("../services/astroChatPricing");

const ASTROLOGERS = [
  {
    phone: "+919000000001",
    name: "Pt. Ramesh Sharma",
    gender: "male",
    city: "Kanpur",
    state: "Uttar Pradesh",
    experience: 12,
    bio: "Vedic astrologer. Kundli, marriage matching and career guidance.",
    specializations: ["Vedic", "Kundli", "Marriage"],
    languages: ["Hindi", "English"],
    chatRate: 10,
    commissionPercentage: 50,
  },
  {
    phone: "+919000000002",
    name: "Brij Mohan Shastri",
    gender: "female",
    city: "Lucknow",
    state: "Uttar Pradesh",
    experience: 8,
    bio: "Tarot and numerology expert. Love, career and finance readings.",
    specializations: ["Tarot", "Numerology", "Career"],
    languages: ["Hindi", "English", "Sanskrit"],
    chatRate: 15,
    commissionPercentage: 40,
  },
];

const DEMO_CUSTOMER = { phone: "+919000000100", name: "Demo Customer", walletAmount: 500 };

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing in .env");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected\n");

  for (const item of ASTROLOGERS) {
    const { phone, name, ...profile } = item;

    const user = await User.findOneAndUpdate(
      { phone },
      { $set: { name, role: "astrologer", status: "approved" }, $setOnInsert: { phone } },
      { upsert: true, new: true }
    );

    const vendor = await Vendor.findOneAndUpdate(
      { user: user._id },
      {
        $set: {
          ...profile,
          user: user._id,
          role: "astrologer",
          name,
          phone,
          status: "approved",
          isOnline: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const split = splitAmount(vendor.chatRate, vendor.commissionPercentage);

    console.log(`Astrologer: ${name}`);
    console.log(`  phone       : ${phone}   (login with OTP)`);
    console.log(`  vendorId    : ${vendor._id}`);
    console.log(
      `  per minute  : user pays Rs ${split.gross} | astrologer gets Rs ${split.astrologer} | admin gets Rs ${split.commission}\n`
    );
  }

  const customer = await User.findOneAndUpdate(
    { phone: DEMO_CUSTOMER.phone },
    {
      $set: { name: DEMO_CUSTOMER.name, role: "customer", status: "approved" },
      $setOnInsert: { phone: DEMO_CUSTOMER.phone },
    },
    { upsert: true, new: true }
  );

  const { wallet, duplicate } = await creditWallet({
    userId: customer._id,
    amount: DEMO_CUSTOMER.walletAmount,
    category: "adjustment",
    referenceId: `SEED-ASTROCHAT-DEMO-WALLET-${customer._id}`,
    description: "Demo balance for astrologer chat testing",
  });

  console.log(`Customer: ${DEMO_CUSTOMER.name}`);
  console.log(`  phone       : ${DEMO_CUSTOMER.phone}   (login with OTP)`);
  console.log(
    `  wallet      : Rs ${wallet.balance}${duplicate ? "  (demo balance was already added earlier)" : ""}\n`
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Seed astro chat error:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
