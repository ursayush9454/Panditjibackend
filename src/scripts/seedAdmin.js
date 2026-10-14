require("dotenv").config();

const mongoose = require("mongoose");

const User = require("../models/User");
const Admin = require("../models/Admin");

const ADMIN_PHONE = process.env.ADMIN_PHONE; // set in .env, must be a real phone you control
const ADMIN_NAME = "Vaidic Sanskar Admin";
const ADMIN_EMAIL = "admin@vaidicsanskar.com";

const seedAdmin = async () => {
  try {
    if (!ADMIN_PHONE) {
      throw new Error("ADMIN_PHONE is missing in .env");
    }

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in .env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    let user = await User.findOne({
      phone: ADMIN_PHONE,
    });

    if (!user) {
      user = await User.create({
        phone: ADMIN_PHONE,
        role: "admin",
        status: "approved",
      });

      console.log("Admin user created");
    } else {
      user.role = "admin";
      user.status = "approved";

      await user.save();

      console.log("Existing user converted to admin");
    }

    let admin = await Admin.findOne({
      user: user._id,
    });

    if (!admin) {
      admin = await Admin.create({
        user: user._id,
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        isActive: true,
      });

      console.log("Admin profile created");
    } else {
      console.log("Admin profile already exists");
    }

    console.log("\n==============================");
    console.log("ADMIN READY");
    console.log("==============================");
    console.log("Phone:", ADMIN_PHONE);
    console.log("Name:", admin.name);
    console.log("Email:", admin.email);
    console.log("User ID:", user._id.toString());
    console.log("Admin ID:", admin._id.toString());
    console.log("==============================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Seed Admin Error:", error);

    await mongoose.disconnect().catch(() => {});

    process.exit(1);
  }
};

seedAdmin();