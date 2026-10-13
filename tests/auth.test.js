// Firebase phone login + Google direct sign-in (stubbed DB + stubbed token verification)
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
process.env.GOOGLE_CLIENT_ID = "web.apps.googleusercontent.com";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const firebase = require("../src/services/firebaseAuthService");
const google = require("../src/services/googleAuthService");
const c = require("../src/controllers/authController");

const now = () => Math.floor(Date.now() / 1000);

const mockRes = () => {
  const r = { code: 200, body: null };
  r.status = (n) => { r.code = n; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

const makeUser = (over = {}) => {
  const u = new User({ role: "customer", status: "approved", ...over });
  u.save = async function () { return this; };
  return u;
};

// in-memory User store
let db = [];
const matches = (u, q) => {
  if (q.googleId !== undefined && u.googleId !== q.googleId) return false;
  if (q.phone && q.phone.$in && !q.phone.$in.includes(u.phone)) return false;
  if (q.email instanceof RegExp && !(u.email && q.email.test(u.email))) return false;
  if (q._id && q._id.$ne && String(u._id) === String(q._id.$ne)) return false;
  if (q.$or) return q.$or.some((o) => matches(u, o));
  return true;
};
User.findOne = async (q) => db.find((u) => matches(u, q)) || null;
User.findById = async (id) => db.find((u) => String(u._id) === String(id)) || null;
User.create = async (d) => { const u = makeUser(d); db.push(u); return u; };

const phoneToken = (phone, over = {}) => ({ uid: "fb1", auth_time: now(), iat: now(), phone_number: phone, firebase: { sign_in_provider: "phone" }, ...over });

test("phoneCandidates / canonicalPhone", () => {
  assert.ok(firebase.phoneCandidates("+919876543210").includes("9876543210"));
  assert.ok(firebase.phoneCandidates("9876543210").includes("+919876543210"));
  assert.equal(firebase.canonicalPhone("+919876543210"), "9876543210");
  assert.equal(firebase.canonicalPhone("+14155550123"), "+14155550123");
});

test("firebase phone login: creates a new customer, then logs the same user in again", async () => {
  db = [];
  firebase._setVerifier(async () => phoneToken("+919876543210"));
  let res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.isNewUser, true);
  assert.equal(res.body.user.phone, "9876543210");
  assert.equal(res.body.needsPhone, false);
  assert.ok(res.body.token);

  res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.isNewUser, false);
  assert.equal(db.length, 1);
});

test("firebase phone login: finds an old account stored as +91...", async () => {
  db = [makeUser({ phone: "+919876543210", name: "Old" })];
  firebase._setVerifier(async () => phoneToken("+919876543210"));
  const res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.body.user.name, "Old");
  assert.equal(db.length, 1);
});

test("firebase login: suspended, stale token, bad provider, bad token", async () => {
  db = [makeUser({ phone: "9876543210", status: "suspended" })];
  firebase._setVerifier(async () => phoneToken("+919876543210"));
  let res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 403);

  firebase._setVerifier(async () => phoneToken("+919876543210", { auth_time: now() - 3600 }));
  res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 401);

  firebase._setVerifier(async () => phoneToken("+919876543210", { firebase: { sign_in_provider: "password" } }));
  res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 400);

  firebase._setVerifier(async () => { throw new Error("bad"); });
  res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 401);

  res = mockRes();
  await c.firebaseLogin({ body: {} }, res);
  assert.equal(res.code, 400);
});

test("SMS OTP endpoints are switched off when AUTH_OTP_MODE=firebase", async () => {
  process.env.AUTH_OTP_MODE = "firebase";
  let res = mockRes();
  await c.sendOtp({ body: { phone: "9876543210" } }, res);
  assert.equal(res.code, 400);
  assert.equal(res.body.useFirebase, true);
  res = mockRes();
  await c.verifyOtp({ body: {} }, res);
  assert.equal(res.body.useFirebase, true);
  delete process.env.AUTH_OTP_MODE;
});

test("google direct sign-in: new user is created without a phone, same user logs in next time", async () => {
  db = [];
  google._setClient({ verifyIdToken: async () => ({ getPayload: () => ({ sub: "g1", email: "New@Gmail.com", email_verified: true, name: "Neha", picture: "http://p/x.png" }) }) });
  let res = mockRes();
  await c.googleLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.isNewUser, true);
  assert.equal(res.body.needsPhone, true);
  assert.equal(res.body.user.email, "new@gmail.com");
  assert.equal(res.body.user.role, "customer");

  res = mockRes();
  await c.googleLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.isNewUser, false);
  assert.equal(db.length, 1);
});

test("google sign-in attaches to an existing account with the same email (no duplicate)", async () => {
  db = [makeUser({ phone: "9876543210", email: "ravi@gmail.com" })];
  google._setClient({ verifyIdToken: async () => ({ getPayload: () => ({ sub: "g9", email: "ravi@gmail.com", email_verified: true }) }) });
  const res = mockRes();
  await c.googleLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.user.phone, "9876543210");
  assert.equal(res.body.user.googleId, "g9");
  assert.equal(db.length, 1);
});

test("google through Firebase (provider google.com) works the same way", async () => {
  db = [];
  firebase._setVerifier(async () => ({ uid: "u", auth_time: now(), email: "x@gmail.com", email_verified: true, name: "X", firebase: { sign_in_provider: "google.com", identities: { "google.com": ["gid-77"] } } }));
  const res = mockRes();
  await c.firebaseLogin({ body: { idToken: "t" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.user.googleId, "gid-77");
  assert.equal(res.body.needsPhone, true);
});

test("link phone: saves a verified phone, refuses a number used by someone else", async () => {
  const me = makeUser({ email: "me@gmail.com" });
  const other = makeUser({ phone: "9999999999" });
  db = [me, other];

  firebase._setVerifier(async () => phoneToken("+919876543210"));
  let res = mockRes();
  await c.linkPhone({ user: me, body: { idToken: "t" } }, res);
  assert.equal(res.code, 200);
  assert.equal(me.phone, "9876543210");

  firebase._setVerifier(async () => phoneToken("+919999999999"));
  res = mockRes();
  await c.linkPhone({ user: me, body: { idToken: "t" } }, res);
  assert.equal(res.code, 409);
});

test("User schema: phone optional, unique index only when a phone exists", () => {
  assert.equal(new User({ email: "a@b.com", googleId: "g" }).validateSync(), undefined);
  const idx = User.schema.indexes().find(([k]) => k.phone === 1);
  assert.ok(idx[1].unique);
  assert.deepEqual(idx[1].partialFilterExpression, { phone: { $type: "string" } });
});

test("requirePhone middleware", () => {
  const mw = require("../src/middleware/requirePhone");
  let res = mockRes(); let called = false;
  mw({ user: { phone: undefined } }, res, () => { called = true; });
  assert.equal(res.code, 403); assert.equal(res.body.needsPhone, true); assert.equal(called, false);
  res = mockRes();
  mw({ user: { phone: "9876543210" } }, res, () => { called = true; });
  assert.equal(called, true);
});
