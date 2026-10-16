// Email + password login, one-time reset for old users, Brevo-first / SMTP-fallback mail.
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";
process.env.BREVO_API_KEY = "brevo-test";
process.env.BREVO_SENDER_EMAIL = "noreply@example.com";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_USER = "smtp-user@example.com";
process.env.SMTP_PASS = "pw";
delete process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES;

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");

const User = require("../src/models/User");
const Otp = require("../src/models/Otp");

// ---- stubs: mail providers
let brevoCalls = 0;
let smtpCalls = 0;
let brevoFails = false;
let smtpFails = false;
let lastMailText = "";

axios.post = async (url, body) => {
  brevoCalls++;
  lastMailText = body.textContent;
  if (brevoFails) throw new Error("brevo down");
  return { data: { messageId: "brevo-1" } };
};
nodemailer.createTransport = () => ({
  sendMail: async (m) => {
    smtpCalls++;
    lastMailText = m.text;
    if (smtpFails) throw new Error("smtp down");
    return { messageId: "smtp-1" };
  },
});

// ---- stubs: Otp + User
let otps = [];
Otp.findOne = async (q) => otps.find((o) => o.email === q.email && o.purpose === q.purpose) || null;
Otp.findOneAndUpdate = async (q, upd) => {
  otps = otps.filter((o) => !(o.email === q.email && o.purpose === q.purpose));
  const rec = { _id: String(Math.random()), ...upd.$set, updatedAt: new Date() };
  otps.push(rec);
  return rec;
};
Otp.deleteOne = async ({ _id }) => { otps = otps.filter((o) => o._id !== _id); };

let users = [];
User.findOne = (q) => {
  const found = users.find((u) => q.email instanceof RegExp && q.email.test(u.email)) || null;
  const p = Promise.resolve(found);
  p.select = () => Promise.resolve(found);
  return p;
};

const mailer = require("../src/services/emailService");
const reset = require("../src/services/passwordResetService");
const c = require("../src/controllers/authController");

const mockRes = () => {
  const r = { code: 200, body: null };
  r.status = (n) => { r.code = n; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const resetCounters = () => { brevoCalls = 0; smtpCalls = 0; brevoFails = false; smtpFails = false; otps = []; };
const mail = { to: "a@b.com", subject: "s", text: "t" };

test("mail: Brevo is used first, SMTP is not touched", async () => {
  resetCounters();
  const r = await mailer.sendMail(mail);
  assert.equal(r.provider, "brevo");
  assert.equal(brevoCalls, 1);
  assert.equal(smtpCalls, 0);
});

test("mail: falls back to SMTP when Brevo fails", async () => {
  resetCounters();
  brevoFails = true;
  const r = await mailer.sendMail(mail);
  assert.equal(r.provider, "smtp");
  assert.equal(r.fallback, true);
  assert.equal(brevoCalls, 1);
  assert.equal(smtpCalls, 1);
});

test("mail: throws when both Brevo and SMTP fail", async () => {
  resetCounters();
  brevoFails = true;
  smtpFails = true;
  await assert.rejects(() => mailer.sendMail(mail), /Brevo email failed.*SMTP email failed/);
});

test("reset OTP is valid for 30 minutes by default", async () => {
  resetCounters();
  const before = Date.now();
  const r = await reset.issuePasswordResetOtp("a@b.com");
  assert.equal(r.sent, true);
  const minutes = (otps[0].expiresAt.getTime() - before) / 60000;
  assert.ok(minutes > 29.9 && minutes <= 30.1, String(minutes));
  assert.match(lastMailText, /valid for 30 minutes/);
});

test("reset OTP expiry can be changed with env", async () => {
  resetCounters();
  process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES = "60";
  assert.equal(reset.resetExpiryMinutes(), 60);
  delete process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES;
});

test("reset OTP is removed again when no provider can deliver it", async () => {
  resetCounters();
  brevoFails = true;
  smtpFails = true;
  await assert.rejects(() => reset.issuePasswordResetOtp("a@b.com"));
  assert.equal(otps.length, 0);
});

test("login: email + password works for an account with a password", async () => {
  resetCounters();
  users = [new User({ email: "ram@x.com", status: "approved", role: "customer" })];
  users[0].passwordHash = await bcrypt.hash("secret123", 4);

  let res = mockRes();
  await c.login({ body: { email: "RAM@x.com", password: "secret123" } }, res);
  assert.equal(res.code, 200);
  assert.ok(res.body.token);

  res = mockRes();
  await c.login({ body: { email: "ram@x.com", password: "wrong-pass" } }, res);
  assert.equal(res.code, 401);
});

test("login: old account without a password gets a one-time reset code", async () => {
  resetCounters();
  users = [new User({ email: "old@x.com", status: "approved", role: "customer" })];

  const res = mockRes();
  await c.login({ body: { email: "old@x.com", password: "anything1" } }, res);
  assert.equal(res.code, 403);
  assert.equal(res.body.code, "PASSWORD_RESET_REQUIRED");
  assert.equal(res.body.requiresPasswordReset, true);
  assert.equal(res.body.codeSent, true);
  assert.equal(brevoCalls, 1);
  assert.equal(otps.length, 1);

  // trying again within 30s must not spam another email
  const again = mockRes();
  await c.login({ body: { email: "old@x.com", password: "anything1" } }, again);
  assert.equal(again.body.codeSent, true);
  assert.equal(brevoCalls, 1);
});

test("login: unknown email gets the generic 401 and no mail", async () => {
  resetCounters();
  users = [];
  const res = mockRes();
  await c.login({ body: { email: "nobody@x.com", password: "whatever1" } }, res);
  assert.equal(res.code, 401);
  assert.equal(brevoCalls, 0);
});

test("forgot password: unknown email sends nothing, known email sends one code", async () => {
  resetCounters();
  users = [new User({ email: "ram@x.com", status: "approved", role: "customer" })];

  let res = mockRes();
  await c.forgotPassword({ body: { email: "nobody@x.com" } }, res);
  assert.equal(res.code, 200);
  assert.equal(brevoCalls, 0);

  res = mockRes();
  await c.forgotPassword({ body: { email: "ram@x.com" } }, res);
  assert.equal(res.code, 200);
  assert.equal(brevoCalls, 1);
  assert.equal(otps.length, 1);
});
