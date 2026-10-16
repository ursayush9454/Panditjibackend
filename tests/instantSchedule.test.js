const test = require("node:test");
const assert = require("node:assert");

test("dispatch defaults: 5 km, 2 min per Pandit, 48h advance, 2h reminders", () => {
  const S = require("../src/models/InstantDispatchSettings");
  const d = new S({});
  assert.strictEqual(d.defaultRadiusKm, 5);
  assert.strictEqual(d.offerTimeoutSeconds, 120);
  assert.strictEqual(d.minAdvanceHours, 48);
  assert.strictEqual(d.reminderStartHours, 2);
  assert.strictEqual(d.reminderIntervalMinutes, 30);
});

test("dispatch service exposes scheduled-booking helpers", () => {
  const d = require("../src/services/dispatchService");
  for (const k of [
    "offerNext", "closeCurrentOffer", "sweep", "sendArrivalReminders",
    "getDispatchSettings", "MIN_ADVANCE_HOURS", "DEFAULT_RADIUS_KM",
  ]) assert.strictEqual(typeof d[k], "function", k);
});

test("InstantRequest tracks repeating reminders", () => {
  const R = require("../src/models/InstantRequest");
  const r = new R({});
  assert.strictEqual(r.reminderCount, 0);
  assert.strictEqual(r.lastReminderAt, null);
  assert.strictEqual(r.radiusKm, 5);
});

test("admin can change the new settings", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "../src/controllers/adminController.js"), "utf8");
  for (const f of ["minAdvanceHours", "reminderStartHours", "reminderIntervalMinutes"])
    assert.ok(src.includes(`"${f}"`), f);
});
