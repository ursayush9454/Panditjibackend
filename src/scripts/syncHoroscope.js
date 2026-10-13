require("dotenv").config();
const mongoose = require("mongoose");
const { generateDailyHoroscopes } = require("../jobs/dailyHoroscopeJob");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(await generateDailyHoroscopes()); // onlyMissing nahi, to aaj ka sab overwrite hoga
  await mongoose.disconnect();
})();