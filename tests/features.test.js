// Tests for: horoscope language guard, Google login, email service (no DB / no network)
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
process.env.GOOGLE_CLIENT_ID = "web-client.apps.googleusercontent.com,android-client.apps.googleusercontent.com";

const test = require("node:test");
const assert = require("node:assert/strict");

const { matchesLanguage } = require("../src/services/horoscopeProviderService");
const google = require("../src/services/googleAuthService");
const email = require("../src/services/emailService");

test("horoscope language guard: Ukrainian is rejected for hi/en, Hindi and English pass", () => {
  const ukrainian = "Сьогодні вдалий день для нових починань і важливих розмов з близькими людьми.";
  const hindi = "आज का दिन नए कामों की शुरुआत और परिवार के साथ समय बिताने के लिए शुभ रहेगा।";
  const english = "Today is a good day to start new work and spend time with your family.";

  assert.equal(matchesLanguage(ukrainian, "hi"), false);
  assert.equal(matchesLanguage(ukrainian, "en"), false);
  assert.equal(matchesLanguage(hindi, "hi"), true);
  assert.equal(matchesLanguage(hindi, "en"), false);
  assert.equal(matchesLanguage(english, "en"), true);
  assert.equal(matchesLanguage(english, "hi"), false);
  assert.equal(matchesLanguage("short", "hi"), true); // too short to judge
  assert.equal(matchesLanguage(ukrainian, "xx"), true); // unknown code is not blocked
});

test("google: valid token returns normalised identity", async () => {
  let seen;
  google._setClient({
    verifyIdToken: async (opts) => {
      seen = opts;
      return { getPayload: () => ({ sub: "123", email: "Ravi@Example.com", email_verified: true, name: "Ravi" }) };
    },
  });
  const g = await google.verifyGoogleIdToken("token");
  assert.equal(g.email, "ravi@example.com");
  assert.equal(g.googleId, "123");
  assert.deepEqual(seen.audience, ["web-client.apps.googleusercontent.com", "android-client.apps.googleusercontent.com"]);
});

test("google: rejects bad token, unverified email and missing config", async () => {
  google._setClient({ verifyIdToken: async () => { throw new Error("bad signature"); } });
  await assert.rejects(google.verifyGoogleIdToken("x"), (e) => e.status === 401);

  google._setClient({ verifyIdToken: async () => ({ getPayload: () => ({ sub: "1", email: "a@b.com", email_verified: false }) }) });
  await assert.rejects(google.verifyGoogleIdToken("x"), (e) => e.status === 401);

  await assert.rejects(google.verifyGoogleIdToken(""), (e) => e.status === 400);

  const saved = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  await assert.rejects(google.verifyGoogleIdToken("x"), (e) => e.status === 503);
  process.env.GOOGLE_CLIENT_ID = saved;
});

test("email: never throws, skips when SMTP is missing or recipient invalid", async () => {
  const saved = { ...process.env };
  delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
  assert.equal((await email.sendMail({ to: "a@b.com", subject: "s", text: "t" })).sent, false);
  assert.equal((await email.sendMail({ to: "not-an-email", subject: "s", text: "t" })).sent, false);
  Object.assign(process.env, saved);
});

test("auth routes: /auth/google needs a token body, /auth/google/link needs login", async () => {
  const http = require("node:http");
  const app = require("../src/app");
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/partner/auth`;
  try {
    google._setClient({ verifyIdToken: async () => { throw new Error("nope"); } });
    const r1 = await fetch(`${base}/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: "abc" }) });
    assert.equal(r1.status, 401);
    const r2 = await fetch(`${base}/google/link`, { method: "POST" });
    assert.equal(r2.status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("google login email lookup: special characters in the email are matched literally", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/controllers/authController.js"), "utf8");
  const line = src.split(/\r?\n/).find((l) => l.startsWith("const escapeRegex"));
  const escapeRegex = new Function(`${line}; return escapeRegex;`)();
  const rx = new RegExp(`^${escapeRegex("a.b+c@ex.com")}$`, "i");
  assert.ok(rx.test("A.B+C@ex.com"));
  assert.ok(!rx.test("aXb+c@ex.com")); // '.' must not match any character
  assert.ok(!rx.test("a.bbc@ex.com")); // '+' must not act as a quantifier
});
