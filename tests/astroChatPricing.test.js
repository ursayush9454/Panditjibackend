// Pure money logic of paid astrologer chat. No database needed.
const test = require("node:test");
const assert = require("node:assert/strict");

const { splitAmount, resolveCommissionPercent, toPercent, roundMoney } = require("../src/services/astroChatPricing");

test("rate 10 with 50% commission: user pays 10, astrologer 5, admin 5", () => {
  assert.deepEqual(splitAmount(10, 50), { gross: 10, commission: 5, astrologer: 5, commissionPercent: 50 });
});

test("rate 15 with 40% commission: astrologer 9, admin 6", () => {
  const s = splitAmount(15, 40);
  assert.equal(s.astrologer, 9);
  assert.equal(s.commission, 6);
});

test("commission + astrologer always equals the gross rate (no paisa lost)", () => {
  for (const [rate, pct] of [[33, 33.33], [19.99, 17.5], [7, 12.34], [101, 0.5], [1, 99.99]]) {
    const s = splitAmount(rate, pct);
    assert.equal(roundMoney(s.commission + s.astrologer), s.gross, `rate ${rate} pct ${pct}`);
  }
});

test("0% commission gives everything to the astrologer, 100% gives everything to admin", () => {
  assert.equal(splitAmount(20, 0).astrologer, 20);
  assert.equal(splitAmount(20, 100).astrologer, 0);
  assert.equal(splitAmount(20, 100).commission, 20);
});

test("invalid rate or commission is rejected", () => {
  assert.throws(() => splitAmount(0, 50));
  assert.throws(() => splitAmount(-5, 50));
  assert.throws(() => splitAmount(10, 101));
  assert.throws(() => splitAmount(10, -1));
  assert.throws(() => splitAmount(10, "abc"));
});

test("commission percent resolution: astrologer override -> global -> fallback", () => {
  assert.equal(resolveCommissionPercent(40, 25, 20), 40);
  assert.equal(resolveCommissionPercent(null, 25, 20), 25);
  assert.equal(resolveCommissionPercent(undefined, undefined, 30), 30);
  assert.equal(resolveCommissionPercent(null, null, null), 20);
  assert.equal(resolveCommissionPercent(0, 25, 20), 0); // 0% is a valid override
  assert.equal(resolveCommissionPercent(150, 25, 20), 25); // invalid values are skipped
});

test("toPercent only accepts 0..100", () => {
  assert.equal(toPercent("50"), 50);
  assert.equal(toPercent(""), null);
  assert.equal(toPercent(null), null);
  assert.equal(toPercent(101), null);
});

test("a 25 minute chat at 10/min with 50% commission", () => {
  const s = splitAmount(10, 50);
  assert.equal(roundMoney(s.gross * 25), 250);
  assert.equal(roundMoney(s.astrologer * 25), 125);
  assert.equal(roundMoney(s.commission * 25), 125);
});
