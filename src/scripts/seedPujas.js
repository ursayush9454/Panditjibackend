require("dotenv").config();

const mongoose = require("mongoose");
const Puja = require("../models/Puja");
const pujaCatalog = require("../Data/pujaCatalog");

const MONGO_URI = process.env.MONGO_URI;

const seedPujas = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is missing in .env");
    }

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected");

    let created = 0;
    let updated = 0;

    for (const pujaData of pujaCatalog) {
      const existing = await Puja.findOne({
        slug: pujaData.slug,
      });

      if (existing) {
        await Puja.updateOne(
          { _id: existing._id },
          {
            $set: pujaData,
          }
        );

        updated++;
        console.log(`Updated: ${pujaData.name}`);
      } else {
        await Puja.create(pujaData);

        created++;
        console.log(`Created: ${pujaData.name}`);
      }
    }

    console.log("--------------------------------");
    console.log("PUJA SEED COMPLETED");
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Total catalog: ${pujaCatalog.length}`);
    console.log("--------------------------------");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Puja seed error:", error);

    await mongoose.disconnect();
    process.exit(1);
  }
};

seedPujas();