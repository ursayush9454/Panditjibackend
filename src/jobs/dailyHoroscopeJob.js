
const cron = require("node-cron");

const Horoscope = require("../models/Horoscope");

const {
  fetchDailyHoroscope,
  VALID_SIGNS,
} = require("../services/horoscopeProviderService");

// Retry configuration
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

let scheduledTask = null;
let isRunning = false;

// Get current date in India timezone
function getIndiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const dateParts = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      dateParts[part.type] = part.value;
    }
  }

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

// Delay helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch horoscope with retry and date validation
async function fetchHoroscopeWithRetry(zodiacSign, expectedDate) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `[Horoscope] Fetching ${zodiacSign} (attempt ${attempt}/${MAX_ATTEMPTS})`
      );

      const horoscope = await fetchDailyHoroscope(
        zodiacSign,
        expectedDate
      );

      if (!horoscope.date || horoscope.date !== expectedDate) {
        throw new Error(
          `Provider date mismatch: expected ${expectedDate}, received ${
            horoscope.date || "missing"
          }`
        );
      }

      return horoscope;
    } catch (error) {
      lastError = error;

      console.error(
        `[Horoscope] Attempt ${attempt}/${MAX_ATTEMPTS} failed for ${zodiacSign}:`,
        error.response?.data || error.message
      );

      if (attempt < MAX_ATTEMPTS) {
        const delay = RETRY_DELAY_MS * attempt;

        console.log(
          `[Horoscope] Retrying ${zodiacSign} in ${delay / 1000}s...`
        );

        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(
    `All attempts failed for ${zodiacSign}`
  );
}

// Generate and save daily horoscopes
async function generateDailyHoroscopes({
  onlyMissing = false,
} = {}) {
  if (isRunning) {
    console.log(
      "[Horoscope] Job already running; skipping duplicate run."
    );

    return { skipped: true };
  }

  isRunning = true;

  const today = getIndiaDate();

  let successCount = 0;
  let skippedCount = 0;
  let failureCount = 0;

  const failedSigns = [];

  console.log(`[Horoscope] Starting sync for ${today}`);

  try {
    for (const zodiacSign of VALID_SIGNS) {
      try {
        // Skip signs already saved during startup recovery
        if (onlyMissing) {
          const exists = await Horoscope.exists({
            zodiacSign,
            date: today,
            period: "daily",
          });

          if (exists) {
            skippedCount++;

            console.log(
              `[Horoscope] Already exists, skipping ${zodiacSign}`
            );

            continue;
          }
        }

        // Retry provider failures before marking the sign failed
        const horoscope = await fetchHoroscopeWithRetry(
          zodiacSign,
          today
        );

        // Save only after a valid response is received
        await Horoscope.updateOne(
          {
            zodiacSign,
            date: today,
            period: "daily",
          },
          {
            $set: {
              content: horoscope.content,
              luckyNumber: horoscope.luckyNumber,
              luckyColor: horoscope.luckyColor,
              provider: horoscope.provider,
            },
            $setOnInsert: {
              user: null,
            },
          },
          {
            upsert: true,
            runValidators: true,
          }
        );

        successCount++;

        console.log(
          `[Horoscope] Saved ${zodiacSign} for ${today}`
        );
      } catch (error) {
        failureCount++;
        failedSigns.push(zodiacSign);

        console.error(
          `[Horoscope] Final failure for ${zodiacSign}:`,
          error.response?.data || error.message
        );
      }
    }

    const summary = {
      date: today,
      totalSigns: VALID_SIGNS.length,
      successCount,
      skippedCount,
      failureCount,
      failedSigns,
    };

    console.log("[Horoscope] Sync finished:", summary);

    return summary;
  } finally {
    isRunning = false;
  }
}

// Register the daily scheduler
function startDailyHoroscopeJob() {
  if (process.env.HOROSCOPE_CRON_ENABLED !== "true") {
    console.log(
      "[Horoscope] Scheduler disabled by environment."
    );

    return;
  }

  if (scheduledTask) {
    console.log(
      "[Horoscope] Scheduler already started."
    );

    return;
  }

  scheduledTask = cron.schedule(
    "0 5 * * *",
    async () => {
      await generateDailyHoroscopes();
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log(
    "[Horoscope] Daily scheduler registered for 5:00 AM IST."
  );

  // On startup, fill only missing records for today
  generateDailyHoroscopes({
    onlyMissing: true,
  }).catch((error) => {
    console.error(
      "[Horoscope] Startup sync failed:",
      error.message
    );
  });
}

// Stop scheduler during graceful shutdown
function stopDailyHoroscopeJob() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;

    console.log("[Horoscope] Scheduler stopped.");
  }
}

module.exports = {
  startDailyHoroscopeJob,
  stopDailyHoroscopeJob,
  generateDailyHoroscopes,
};
