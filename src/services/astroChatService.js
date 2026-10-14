/**
 * Paid astrologer chat (Astrotalk style).
 *
 * Flow
 *   customer requests  ->  astrologer accepts  ->  minute 1 is charged immediately
 *   -> every minute the customer wallet is debited and the astrologer wallet is credited
 *   -> chat ends (either side / low balance / disconnect) -> one Earning record is written.
 *
 * Money per minute (snapshot taken when the request is made):
 *   customer pays   ratePerMinute            (set by ADMIN on the Vendor, astrologer cannot change it)
 *   astrologer gets ratePerMinute - commission
 *   admin keeps     commission = ratePerMinute * commissionPercent / 100
 */
const mongoose = require("mongoose");

const AstroChatSession = require("../models/AstroChatSession");
const AstroChatMessage = require("../models/AstroChatMessage");
const Vendor = require("../models/Vendor");
const Commission = require("../models/Commission");
const Earning = require("../models/Earning");

const { getOrCreateWallet, creditWallet, debitWallet } = require("./walletService");
const { emitToUser } = require("./realtime");
const { notifyUser } = require("./notificationService");
const pricing = require("./astroChatPricing");

// =====================================================
// CONFIG (read on every call so .env changes / tests work)
// =====================================================

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const cfg = () => ({
  requestTtlMs: num(process.env.ASTRO_CHAT_REQUEST_TTL_SEC, 60) * 1000,
  minMinutes: num(process.env.ASTRO_CHAT_MIN_MINUTES, 2),
  intervalMs: num(process.env.ASTRO_CHAT_BILLING_INTERVAL_SEC, 60) * 1000,
  graceMs: num(process.env.ASTRO_CHAT_DISCONNECT_GRACE_SEC, 90) * 1000,
  defaultCommission: num(process.env.ASTRO_CHAT_DEFAULT_COMMISSION_PERCENT, 20),
  maxMessageLength: 2000,
});

// If the server was down and a billing tick is older than this, we END the chat
// instead of charging the customer for the downtime.
const STALE_TICK_MS = 30 * 1000;
const SWEEP_EVERY_MS = 2000;

class ChatError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = "ChatError";
    this.status = status;
    this.extra = extra;
  }
}

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));
const idOf = (value) => String(value && value._id ? value._id : value);
const isInsufficient = (error) => /insufficient/i.test(String(error && error.message));

// =====================================================
// VIEWS  (what each role is allowed to see)
// Astrologer NEVER sees the customer price or the commission, only their own earning.
// =====================================================

const customerView = (s) => ({
  id: s._id,
  sessionNumber: s.sessionNumber,
  status: s.status,
  astrologer: {
    id: idOf(s.astrologer),
    name: (s.astrologer && s.astrologer.name) || "",
    profileImage: (s.astrologer && s.astrologer.profileImage) || "",
  },
  ratePerMinute: s.ratePerMinute,
  billedMinutes: s.billedMinutes,
  totalCharged: s.totalCharged,
  startedAt: s.startedAt,
  endedAt: s.endedAt,
  endReason: s.endReason,
  requestExpiresAt: s.requestExpiresAt,
  nextBillAt: s.nextBillAt,
});

const astrologerView = (s) => ({
  id: s._id,
  sessionNumber: s.sessionNumber,
  status: s.status,
  customer: {
    name: (s.customer && s.customer.name) || "User",
    profileImage: (s.customer && s.customer.profileImage) || "",
  },
  billedMinutes: s.billedMinutes,
  earningPerMinute: s.astrologerPerMinute,
  earnedAmount: s.astrologerEarning,
  startedAt: s.startedAt,
  endedAt: s.endedAt,
  endReason: s.endReason,
  requestExpiresAt: s.requestExpiresAt,
});

const adminView = (s) => ({
  id: s._id,
  sessionNumber: s.sessionNumber,
  status: s.status,
  customer: {
    id: idOf(s.customer),
    name: (s.customer && s.customer.name) || "",
    phone: (s.customer && s.customer.phone) || "",
  },
  astrologer: {
    id: idOf(s.astrologer),
    name: (s.astrologer && s.astrologer.name) || "",
  },
  ratePerMinute: s.ratePerMinute,
  commissionPercent: s.commissionPercent,
  commissionPerMinute: s.commissionPerMinute,
  astrologerPerMinute: s.astrologerPerMinute,
  billedMinutes: s.billedMinutes,
  totalCharged: s.totalCharged,
  astrologerEarning: s.astrologerEarning,
  adminCommission: s.adminCommission,
  startedAt: s.startedAt,
  endedAt: s.endedAt,
  endReason: s.endReason,
  billingIssue: s.billingIssue,
  createdAt: s.createdAt,
});

const messageView = (m) => ({
  id: m._id,
  sessionId: m.session,
  sender: m.sender,
  receiver: m.receiver,
  text: m.text,
  createdAt: m.createdAt,
});

const populateSession = (query) =>
  query
    .populate({ path: "customer", select: "name phone profileImage" })
    .populate({ path: "astrologer", select: "name profileImage" });

const loadSession = (id) => populateSession(AstroChatSession.findById(id));

// =====================================================
// HELPERS
// =====================================================

const resolveCommission = async (vendor) => {
  const config = await Commission.findOne({ serviceType: "chat", isActive: true }).lean();

  return pricing.resolveCommissionPercent(
    vendor.commissionPercentage, // per-astrologer override set by admin
    config && config.percentage, // global "chat" commission set by admin
    cfg().defaultCommission // .env fallback
  );
};

const safeNotify = (payload) => {
  Promise.resolve()
    .then(() => notifyUser(payload))
    .catch((e) => console.error("AstroChat notify failed:", e.message));
};

const getParticipantSession = async (sessionId, userId) => {
  if (!isValidId(sessionId)) throw new ChatError("Invalid chat id", 400);

  const session = await AstroChatSession.findById(sessionId);
  if (!session) throw new ChatError("Chat not found", 404);

  const isCustomer = String(session.customer) === String(userId);
  const isAstrologer = String(session.astrologerUser) === String(userId);

  if (!isCustomer && !isAstrologer) throw new ChatError("Chat not found", 404);

  return { session, isCustomer, isAstrologer };
};

const emitBoth = (session, event, customerPayload, astrologerPayload) => {
  emitToUser(session.customer, event, customerPayload);
  emitToUser(session.astrologerUser, event, astrologerPayload);
};

const emitEnded = async (sessionId, reason) => {
  const populated = await loadSession(sessionId);
  if (!populated) return null;

  emitBoth(
    populated,
    "astrochat:ended",
    { reason, session: customerView(populated) },
    { reason, session: astrologerView(populated) }
  );

  return populated;
};

// =====================================================
// 1) CUSTOMER REQUESTS A CHAT
// =====================================================

const requestChat = async ({ customerId, astrologerId }) => {
  if (!isValidId(astrologerId)) throw new ChatError("A valid astrologerId is required");

  const config = cfg();

  const vendor = await Vendor.findOne({
    _id: astrologerId,
    role: "astrologer",
    status: "approved",
  });

  if (!vendor) throw new ChatError("Astrologer not found", 404);
  if (!vendor.isOnline) throw new ChatError("Astrologer is offline right now", 409);

  const rate = Number(vendor.chatRate || 0);
  if (!(rate > 0)) throw new ChatError("Chat is not available for this astrologer", 409);

  const wallet = await getOrCreateWallet(customerId);
  if (wallet.status !== "active") throw new ChatError("Your wallet is not active", 403);

  const requiredBalance = pricing.roundMoney(rate * config.minMinutes);
  if (wallet.balance < requiredBalance) {
    throw new ChatError(
      `Minimum wallet balance of Rs ${requiredBalance} is required to start this chat`,
      402,
      { requiredBalance, balance: wallet.balance }
    );
  }

  const busy = await AstroChatSession.exists({ astrologer: vendor._id, status: "active" });
  if (busy) throw new ChatError("Astrologer is busy in another chat", 409);

  const percent = await resolveCommission(vendor);
  const split = pricing.splitAmount(rate, percent);

  let session;
  try {
    session = await AstroChatSession.create({
      customer: customerId,
      astrologer: vendor._id,
      astrologerUser: vendor.user,
      status: "requested",
      requestExpiresAt: new Date(Date.now() + config.requestTtlMs),
      ratePerMinute: split.gross,
      commissionPercent: split.commissionPercent,
      commissionPerMinute: split.commission,
      astrologerPerMinute: split.astrologer,
      liveForCustomer: true,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      throw new ChatError("You already have an ongoing chat or pending chat request", 409);
    }
    throw error;
  }

  const populated = await loadSession(session._id);

  emitToUser(vendor.user, "astrochat:request", astrologerView(populated));

  safeNotify({
    userId: vendor.user,
    title: "New chat request",
    message: `${(populated.customer && populated.customer.name) || "A user"} wants to chat with you.`,
    type: "consultation_request",
    priority: "high",
    actionType: "open_chat",
    data: { sessionId: String(session._id) },
  });

  return customerView(populated);
};

// =====================================================
// 2) ASTROLOGER ACCEPTS / REJECTS, CUSTOMER CANCELS
// =====================================================

const expireOne = async (sessionId) => {
  const expired = await AstroChatSession.findOneAndUpdate(
    { _id: sessionId, status: "requested" },
    {
      $set: {
        status: "missed",
        endReason: "expired",
        endedAt: new Date(),
        liveForCustomer: false,
      },
    },
    { new: true }
  );

  if (!expired) return null;

  const populated = await loadSession(expired._id);
  emitBoth(
    populated,
    "astrochat:missed",
    { session: customerView(populated) },
    { session: astrologerView(populated) }
  );

  return populated;
};

const acceptChat = async ({ sessionId, userId }) => {
  if (!isValidId(sessionId)) throw new ChatError("Invalid chat id", 400);

  const existing = await AstroChatSession.findById(sessionId);
  if (!existing || String(existing.astrologerUser) !== String(userId)) {
    throw new ChatError("Chat request not found", 404);
  }

  if (existing.status !== "requested") {
    throw new ChatError(`This request is already ${existing.status}`, 409);
  }

  if (existing.requestExpiresAt && existing.requestExpiresAt <= new Date()) {
    await expireOne(existing._id);
    throw new ChatError("This request has expired", 410);
  }

  const now = new Date();
  let claimed;

  try {
    claimed = await AstroChatSession.findOneAndUpdate(
      { _id: existing._id, status: "requested" },
      {
        $set: {
          status: "active",
          startedAt: now,
          nextBillAt: new Date(now.getTime() + cfg().intervalMs),
          liveForAstrologer: true,
          customerOfflineSince: null,
          astrologerOfflineSince: null,
        },
      },
      { new: true }
    );
  } catch (error) {
    if (error && error.code === 11000) {
      throw new ChatError("You are already in another active chat", 409);
    }
    throw error;
  }

  if (!claimed) throw new ChatError("This request is no longer pending", 409);

  // Minute 1 is charged right now. If the customer cannot pay, the chat never starts.
  try {
    const result = await billMinute(claimed, 1);
    emitBilling(result.session, result.balance);
  } catch (error) {
    await AstroChatSession.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: "cancelled",
          endReason: isInsufficient(error) ? "low_balance" : "system",
          endedAt: new Date(),
          liveForCustomer: false,
          liveForAstrologer: false,
          nextBillAt: null,
        },
      }
    );

    await emitEnded(claimed._id, isInsufficient(error) ? "low_balance" : "system");

    if (isInsufficient(error)) {
      throw new ChatError("Customer does not have enough balance", 402);
    }
    throw error;
  }

  const populated = await loadSession(claimed._id);

  emitBoth(
    populated,
    "astrochat:started",
    { session: customerView(populated) },
    { session: astrologerView(populated) }
  );

  return astrologerView(populated);
};

const rejectChat = async ({ sessionId, userId }) => {
  const { session, isAstrologer } = await getParticipantSession(sessionId, userId);
  if (!isAstrologer) throw new ChatError("Only the astrologer can reject a request", 403);

  const updated = await AstroChatSession.findOneAndUpdate(
    { _id: session._id, status: "requested" },
    {
      $set: {
        status: "rejected",
        endReason: "rejected",
        endedAt: new Date(),
        endedBy: userId,
        liveForCustomer: false,
      },
    },
    { new: true }
  );

  if (!updated) throw new ChatError("This request is no longer pending", 409);

  const populated = await loadSession(updated._id);
  emitBoth(
    populated,
    "astrochat:rejected",
    { session: customerView(populated) },
    { session: astrologerView(populated) }
  );

  return astrologerView(populated);
};

const cancelRequest = async ({ sessionId, userId }) => {
  const { session, isCustomer } = await getParticipantSession(sessionId, userId);
  if (!isCustomer) throw new ChatError("Only the customer can cancel a request", 403);

  const updated = await AstroChatSession.findOneAndUpdate(
    { _id: session._id, status: "requested" },
    {
      $set: {
        status: "cancelled",
        endReason: "cancelled",
        endedAt: new Date(),
        endedBy: userId,
        liveForCustomer: false,
      },
    },
    { new: true }
  );

  if (!updated) throw new ChatError("This request is no longer pending", 409);

  const populated = await loadSession(updated._id);
  emitBoth(
    populated,
    "astrochat:cancelled",
    { session: customerView(populated) },
    { session: astrologerView(populated) }
  );

  return customerView(populated);
};

// =====================================================
// 3) BILLING  (one minute = debit customer + credit astrologer)
// =====================================================

/**
 * Charges ONE minute. Wallet calls are idempotent (unique referenceId per minute),
 * so a retry can never double charge.
 * Throws only if the CUSTOMER debit fails (e.g. insufficient balance).
 */
const billMinute = async (session, minute) => {
  const reference = `ASTROCHAT-${session._id}-M${minute}`;
  const metadata = { astroChatSession: String(session._id), minute };

  const debit = await debitWallet({
    userId: session.customer,
    amount: session.ratePerMinute,
    category: "consultation",
    referenceId: `${reference}-USER`,
    description: `Astrologer chat - minute ${minute}`,
    metadata,
  });

  let credited = true;

  if (session.astrologerPerMinute > 0) {
    const credit = () =>
      creditWallet({
        userId: session.astrologerUser,
        amount: session.astrologerPerMinute,
        category: "earning",
        referenceId: `${reference}-ASTRO`,
        description: `Chat earning - minute ${minute}`,
        metadata,
      });

    try {
      await credit();
    } catch (firstError) {
      try {
        await credit();
      } catch (secondError) {
        credited = false;
        console.error("AstroChat astrologer credit failed:", secondError.message);

        await AstroChatSession.updateOne(
          { _id: session._id },
          {
            $set: {
              billingIssue: `Minute ${minute}: astrologer credit failed (${secondError.message})`,
            },
          }
        );
      }
    }
  }

  const inc = {
    billedMinutes: 1,
    totalCharged: session.ratePerMinute,
    adminCommission: session.commissionPerMinute,
  };
  if (credited) inc.astrologerEarning = session.astrologerPerMinute;

  const updated = await AstroChatSession.findByIdAndUpdate(session._id, { $inc: inc }, { new: true });

  return { session: updated, balance: debit.wallet.balance };
};

const emitBilling = (session, balance) => {
  emitToUser(session.customer, "astrochat:billing", {
    sessionId: session._id,
    minute: session.billedMinutes,
    charged: session.ratePerMinute,
    totalCharged: session.totalCharged,
    balance,
    nextBillAt: session.nextBillAt,
  });

  emitToUser(session.astrologerUser, "astrochat:billing", {
    sessionId: session._id,
    minute: session.billedMinutes,
    earned: session.astrologerPerMinute,
    totalEarned: session.astrologerEarning,
  });

  if (balance < session.ratePerMinute) {
    emitToUser(session.customer, "astrochat:low-balance", {
      sessionId: session._id,
      balance,
      ratePerMinute: session.ratePerMinute,
      secondsLeft: Math.max(
        0,
        Math.round((new Date(session.nextBillAt).getTime() - Date.now()) / 1000)
      ),
    });
  }
};

const billDueSessions = async () => {
  const { intervalMs } = cfg();

  for (let i = 0; i < 100; i += 1) {
    const now = new Date();

    const candidate = await AstroChatSession.findOne({
      status: "active",
      nextBillAt: { $lte: now },
    });
    if (!candidate) break;

    // server was down for a while: do not bill the customer for downtime
    if (now.getTime() - candidate.nextBillAt.getTime() > STALE_TICK_MS) {
      await endInternal({ sessionId: candidate._id, reason: "system" });
      continue;
    }

    // compare-and-swap on nextBillAt so only ONE process bills this minute
    const claimed = await AstroChatSession.findOneAndUpdate(
      { _id: candidate._id, status: "active", nextBillAt: candidate.nextBillAt },
      { $set: { nextBillAt: new Date(candidate.nextBillAt.getTime() + intervalMs) } },
      { new: true }
    );
    if (!claimed) continue;

    try {
      const result = await billMinute(claimed, claimed.billedMinutes + 1);
      emitBilling(result.session, result.balance);
    } catch (error) {
      if (isInsufficient(error)) {
        await endInternal({ sessionId: claimed._id, reason: "low_balance" });
      } else {
        console.error("AstroChat billing error (will retry):", error.message);
        await AstroChatSession.updateOne(
          { _id: claimed._id, status: "active" },
          { $set: { nextBillAt: new Date(Date.now() + 5000) } }
        );
      }
    }
  }
};

// =====================================================
// 4) END CHAT
// =====================================================

const settleEarning = async (session) => {
  if (!(session.astrologerEarning > 0)) return null;

  const reference = `ASTROCHAT-${session._id}`;

  try {
    const earning = await Earning.create({
      vendor: session.astrologer,
      user: session.astrologerUser,
      serviceType: "chat",
      durationMinutes: session.billedMinutes,
      ratePerMinute: session.ratePerMinute,
      grossAmount: session.totalCharged,
      platformFee: session.adminCommission,
      commissionPercentage: session.commissionPercent,
      commissionAmount: session.adminCommission,
      netAmount: session.astrologerEarning,
      // wallet was already credited minute by minute, so this is a record of a credited earning
      status: "credited",
      transactionReference: reference,
      creditedAt: new Date(),
      metadata: { astroChatSession: String(session._id), sessionNumber: session.sessionNumber },
    });

    await AstroChatSession.updateOne({ _id: session._id }, { $set: { earning: earning._id } });
    return earning;
  } catch (error) {
    if (error && error.code === 11000) return null; // already recorded
    console.error("AstroChat earning record failed:", error.message);
    return null;
  }
};

const endInternal = async ({ sessionId, reason, endedBy = null }) => {
  const ended = await AstroChatSession.findOneAndUpdate(
    { _id: sessionId, status: "active" },
    {
      $set: {
        status: "ended",
        endedAt: new Date(),
        endReason: reason,
        endedBy,
        liveForCustomer: false,
        liveForAstrologer: false,
        nextBillAt: null,
      },
    },
    { new: true }
  );

  if (!ended) return null; // already ended by someone else

  await settleEarning(ended);

  return emitEnded(ended._id, reason);
};

const endChat = async ({ sessionId, userId }) => {
  const { session, isCustomer } = await getParticipantSession(sessionId, userId);

  if (session.status === "requested") {
    return isCustomer
      ? cancelRequest({ sessionId, userId })
      : rejectChat({ sessionId, userId });
  }

  if (session.status === "active") {
    const populated = await endInternal({
      sessionId: session._id,
      reason: isCustomer ? "customer_ended" : "astrologer_ended",
      endedBy: userId,
    });

    if (populated) {
      return isCustomer ? customerView(populated) : astrologerView(populated);
    }
  }

  // already finished: idempotent response
  const current = await loadSession(session._id);
  return isCustomer ? customerView(current) : astrologerView(current);
};

// =====================================================
// 5) MESSAGES
// =====================================================

const sendMessage = async ({ sessionId, userId, text }) => {
  const { session, isCustomer } = await getParticipantSession(sessionId, userId);

  if (session.status !== "active") throw new ChatError("This chat is not active", 409);

  const clean = String(text || "").trim();
  if (!clean) throw new ChatError("Message text is required");
  if (clean.length > cfg().maxMessageLength) throw new ChatError("Message is too long");

  const receiver = isCustomer ? session.astrologerUser : session.customer;

  const message = await AstroChatMessage.create({
    session: session._id,
    sender: userId,
    receiver,
    text: clean,
  });

  const payload = { message: messageView(message) };

  // both participants get it (sender too, so multiple devices stay in sync)
  emitToUser(userId, "astrochat:message", payload);
  emitToUser(receiver, "astrochat:message", payload);

  return messageView(message);
};

const getMessages = async ({ sessionId, userId, limit = 50, before = null }) => {
  const { session } = await getParticipantSession(sessionId, userId);

  const filter = { session: session._id };
  if (before && !Number.isNaN(new Date(before).getTime())) {
    filter.createdAt = { $lt: new Date(before) };
  }

  const rows = await AstroChatMessage.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 200))
    .lean();

  return rows.reverse().map(messageView);
};

const sendTyping = async ({ sessionId, userId, isTyping }) => {
  if (!isValidId(sessionId)) return;

  const session = await AstroChatSession.findById(sessionId).select(
    "customer astrologerUser status"
  );
  if (!session || session.status !== "active") return;

  const isCustomer = String(session.customer) === String(userId);
  const isAstrologer = String(session.astrologerUser) === String(userId);
  if (!isCustomer && !isAstrologer) return;

  emitToUser(isCustomer ? session.astrologerUser : session.customer, "astrochat:typing", {
    sessionId,
    isTyping: Boolean(isTyping),
  });
};

// =====================================================
// 6) PRESENCE + SWEEPER
// =====================================================

const markPresence = async (userId, online) => {
  const value = online ? null : new Date();

  await Promise.all([
    AstroChatSession.updateMany(
      { customer: userId, status: "active" },
      { $set: { customerOfflineSince: value } }
    ),
    AstroChatSession.updateMany(
      { astrologerUser: userId, status: "active" },
      { $set: { astrologerOfflineSince: value } }
    ),
  ]);
};

const expireRequests = async () => {
  const rows = await AstroChatSession.find({
    status: "requested",
    requestExpiresAt: { $lte: new Date() },
  })
    .select("_id")
    .limit(50)
    .lean();

  for (const row of rows) {
    await expireOne(row._id);
  }
};

const endDisconnected = async () => {
  const cutoff = new Date(Date.now() - cfg().graceMs);

  const rows = await AstroChatSession.find({
    status: "active",
    $or: [
      { customerOfflineSince: { $lte: cutoff } },
      { astrologerOfflineSince: { $lte: cutoff } },
    ],
  })
    .select("_id")
    .limit(50)
    .lean();

  for (const row of rows) {
    await endInternal({ sessionId: row._id, reason: "disconnected" });
  }
};

let timer = null;
let sweeping = false;

const runSweep = async () => {
  if (sweeping) return;
  sweeping = true;

  try {
    await expireRequests();
    await endDisconnected();
    await billDueSessions();
  } catch (error) {
    console.error("AstroChat sweep error:", error.message);
  } finally {
    sweeping = false;
  }
};

const startAstroChatSweeper = async () => {
  if (timer) return;

  // After a restart no sockets are connected yet. Mark everyone offline; they clear it by
  // reconnecting. Chats where nobody comes back are ended after the grace period.
  try {
    const now = new Date();
    await AstroChatSession.updateMany(
      { status: "active" },
      { $set: { customerOfflineSince: now, astrologerOfflineSince: now } }
    );
  } catch (error) {
    console.error("AstroChat startup presence reset failed:", error.message);
  }

  timer = setInterval(runSweep, SWEEP_EVERY_MS);
};

const stopAstroChatSweeper = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = {
  ChatError,
  cfg,
  resolveCommission,

  customerView,
  astrologerView,
  adminView,
  messageView,
  populateSession,
  loadSession,

  requestChat,
  acceptChat,
  rejectChat,
  cancelRequest,
  endChat,

  sendMessage,
  getMessages,
  sendTyping,

  markPresence,
  runSweep,
  startAstroChatSweeper,
  stopAstroChatSweeper,
};
