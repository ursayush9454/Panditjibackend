// Schema level checks for paid astrologer chat (needs mongoose, no database connection).
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const AstroChatSession = require("../src/models/AstroChatSession");
const AstroChatMessage = require("../src/models/AstroChatMessage");

const oid = () => new mongoose.Types.ObjectId();

test("session requires customer, astrologer and the price snapshot", () => {
  const error = new AstroChatSession({}).validateSync();
  for (const path of [
    "customer",
    "astrologer",
    "astrologerUser",
    "ratePerMinute",
    "commissionPercent",
    "commissionPerMinute",
    "astrologerPerMinute",
  ]) {
    assert.ok(error.errors[path], `${path} should be required`);
  }
});

test("a valid new session starts as requested with zero totals and a session number", () => {
  const s = new AstroChatSession({
    customer: oid(),
    astrologer: oid(),
    astrologerUser: oid(),
    ratePerMinute: 10,
    commissionPercent: 50,
    commissionPerMinute: 5,
    astrologerPerMinute: 5,
  });

  assert.equal(s.validateSync(), undefined);
  assert.equal(s.status, "requested");
  assert.equal(s.billedMinutes, 0);
  assert.equal(s.totalCharged, 0);
  assert.equal(s.liveForCustomer, true);
  assert.equal(s.liveForAstrologer, false);
  assert.match(s.sessionNumber, /^AC-/);
});

test("session rejects unknown status and commission above 100", () => {
  const error = new AstroChatSession({ status: "weird", commissionPercent: 150 }).validateSync();
  assert.ok(error.errors.status);
  assert.ok(error.errors.commissionPercent);
});

test("DB level guards: one live chat per customer, one active chat per astrologer", () => {
  const indexes = AstroChatSession.schema.indexes();
  const named = (name) => indexes.find(([, opts]) => opts && opts.name === name);

  const perCustomer = named("one_live_chat_per_customer");
  const perAstrologer = named("one_active_chat_per_astrologer");

  assert.ok(perCustomer && perCustomer[1].unique);
  assert.deepEqual(perCustomer[1].partialFilterExpression, { liveForCustomer: true });
  assert.ok(perAstrologer && perAstrologer[1].unique);
  assert.deepEqual(perAstrologer[1].partialFilterExpression, { liveForAstrologer: true });
});

test("message needs text and is capped at 2000 characters", () => {
  const base = { session: oid(), sender: oid(), receiver: oid() };

  assert.ok(new AstroChatMessage({ ...base }).validateSync().errors.text);
  assert.ok(new AstroChatMessage({ ...base, text: "x".repeat(2001) }).validateSync().errors.text);
  assert.equal(new AstroChatMessage({ ...base, text: "Namaste" }).validateSync(), undefined);
});
