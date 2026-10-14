const mongoose = require("mongoose");

const AstroChatSession = require("../models/AstroChatSession");
const Vendor = require("../models/Vendor");
const Commission = require("../models/Commission");

const service = require("../services/astroChatService");
const pricing = require("../services/astroChatPricing");

const { ChatError } = service;

// =====================================================
// HELPERS
// =====================================================

const userIdOf = (req) => String(req.user._id || req.user.id);

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const fail = (res, error, label) => {
  if (error instanceof ChatError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...error.extra,
    });
  }

  console.error(`${label}:`, error);
  return res.status(500).json({ success: false, message: "Something went wrong" });
};

const paging = (req) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const viewFor = (req) =>
  req.user.role === "astrologer" ? service.astrologerView : service.customerView;

const sessionFilterFor = (req) =>
  req.user.role === "astrologer"
    ? { astrologerUser: req.user._id }
    : { customer: req.user._id };

// =====================================================
// CUSTOMER
// =====================================================

// GET /astro-chat/astrologers
exports.listAstrologers = async (req, res) => {
  try {
    const astrologers = await Vendor.find({ role: "astrologer", status: "approved" })
      .select("name profileImage bio experience city chatRate isOnline specializations languages")
      .sort({ isOnline: -1, name: 1 })
      .lean();

    const busyRows = await AstroChatSession.find({
      status: "active",
      astrologer: { $in: astrologers.map((a) => a._id) },
    })
      .select("astrologer")
      .lean();

    const busy = new Set(busyRows.map((row) => String(row.astrologer)));

    return res.json({
      success: true,
      count: astrologers.length,
      astrologers: astrologers.map((a) => ({
        id: a._id,
        name: a.name,
        profileImage: a.profileImage || "",
        bio: a.bio || "",
        experience: a.experience || 0,
        city: a.city || "",
        specializations: a.specializations || [],
        languages: a.languages || [],
        isOnline: Boolean(a.isOnline),
        isBusy: busy.has(String(a._id)),
        chatRatePerMinute: a.chatRate || 0,
      })),
    });
  } catch (error) {
    return fail(res, error, "AstroChat listAstrologers");
  }
};

// POST /astro-chat/sessions   { astrologerId }
exports.requestChat = async (req, res) => {
  try {
    const session = await service.requestChat({
      customerId: userIdOf(req),
      astrologerId: req.body.astrologerId,
    });

    return res.status(201).json({ success: true, message: "Chat request sent", session });
  } catch (error) {
    return fail(res, error, "AstroChat requestChat");
  }
};

// POST /astro-chat/sessions/:id/cancel
exports.cancelRequest = async (req, res) => {
  try {
    const session = await service.cancelRequest({
      sessionId: req.params.id,
      userId: userIdOf(req),
    });

    return res.json({ success: true, message: "Chat request cancelled", session });
  } catch (error) {
    return fail(res, error, "AstroChat cancelRequest");
  }
};

// =====================================================
// ASTROLOGER
// =====================================================

// GET /astro-chat/requests/pending
exports.pendingRequests = async (req, res) => {
  try {
    const rows = await service
      .populateSession(
        AstroChatSession.find({
          astrologerUser: req.user._id,
          status: "requested",
          requestExpiresAt: { $gt: new Date() },
        }).sort({ requestedAt: 1 })
      )
      .lean();

    return res.json({
      success: true,
      count: rows.length,
      requests: rows.map(service.astrologerView),
    });
  } catch (error) {
    return fail(res, error, "AstroChat pendingRequests");
  }
};

// POST /astro-chat/sessions/:id/accept
exports.acceptChat = async (req, res) => {
  try {
    const session = await service.acceptChat({
      sessionId: req.params.id,
      userId: userIdOf(req),
    });

    return res.json({ success: true, message: "Chat started", session });
  } catch (error) {
    return fail(res, error, "AstroChat acceptChat");
  }
};

// POST /astro-chat/sessions/:id/reject
exports.rejectChat = async (req, res) => {
  try {
    const session = await service.rejectChat({
      sessionId: req.params.id,
      userId: userIdOf(req),
    });

    return res.json({ success: true, message: "Chat request rejected", session });
  } catch (error) {
    return fail(res, error, "AstroChat rejectChat");
  }
};

// =====================================================
// BOTH PARTIES
// =====================================================

// POST /astro-chat/sessions/:id/end
exports.endChat = async (req, res) => {
  try {
    const session = await service.endChat({
      sessionId: req.params.id,
      userId: userIdOf(req),
    });

    return res.json({ success: true, message: "Chat ended", session });
  } catch (error) {
    return fail(res, error, "AstroChat endChat");
  }
};

// GET /astro-chat/sessions/active   (used to resume after app restart / reconnect)
exports.getActive = async (req, res) => {
  try {
    const filter =
      req.user.role === "astrologer"
        ? { astrologerUser: req.user._id, status: "active" }
        : { customer: req.user._id, status: { $in: ["requested", "active"] } };

    const row = await service.populateSession(AstroChatSession.find(filter).limit(1)).lean();

    return res.json({
      success: true,
      session: row[0] ? viewFor(req)(row[0]) : null,
    });
  } catch (error) {
    return fail(res, error, "AstroChat getActive");
  }
};

// GET /astro-chat/sessions/my?status=ended&page=1&limit=20
exports.mySessions = async (req, res) => {
  try {
    const { page, limit, skip } = paging(req);
    const filter = sessionFilterFor(req);

    if (req.query.status) filter.status = String(req.query.status);

    const [rows, total, sums] = await Promise.all([
      service
        .populateSession(
          AstroChatSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        )
        .lean(),
      AstroChatSession.countDocuments(filter),
      AstroChatSession.aggregate([
        {
          $match: {
            ...(req.user.role === "astrologer"
              ? { astrologerUser: toObjectId(req.user._id) }
              : { customer: toObjectId(req.user._id) }),
            status: { $in: ["active", "ended"] },
          },
        },
        {
          $group: {
            _id: null,
            minutes: { $sum: "$billedMinutes" },
            spent: { $sum: "$totalCharged" },
            earned: { $sum: "$astrologerEarning" },
          },
        },
      ]),
    ]);

    const t = sums[0] || { minutes: 0, spent: 0, earned: 0 };

    return res.json({
      success: true,
      page,
      limit,
      total,
      totals:
        req.user.role === "astrologer"
          ? { totalMinutes: t.minutes, totalEarned: pricing.roundMoney(t.earned) }
          : { totalMinutes: t.minutes, totalSpent: pricing.roundMoney(t.spent) },
      sessions: rows.map(viewFor(req)),
    });
  } catch (error) {
    return fail(res, error, "AstroChat mySessions");
  }
};

// GET /astro-chat/sessions/:id
exports.getSession = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) throw new ChatError("Invalid chat id");

    const row = await service
      .populateSession(
        AstroChatSession.findOne({
          _id: req.params.id,
          $or: [{ customer: req.user._id }, { astrologerUser: req.user._id }],
        })
      )
      .lean();

    if (!row) throw new ChatError("Chat not found", 404);

    const isCustomer = String(row.customer._id || row.customer) === userIdOf(req);

    return res.json({
      success: true,
      session: isCustomer ? service.customerView(row) : service.astrologerView(row),
    });
  } catch (error) {
    return fail(res, error, "AstroChat getSession");
  }
};

// GET /astro-chat/sessions/:id/messages?limit=50&before=<ISO date>
exports.getMessages = async (req, res) => {
  try {
    const messages = await service.getMessages({
      sessionId: req.params.id,
      userId: userIdOf(req),
      limit: req.query.limit,
      before: req.query.before,
    });

    return res.json({ success: true, count: messages.length, messages });
  } catch (error) {
    return fail(res, error, "AstroChat getMessages");
  }
};

// POST /astro-chat/sessions/:id/messages   { text }   (REST fallback, sockets are preferred)
exports.sendMessage = async (req, res) => {
  try {
    const message = await service.sendMessage({
      sessionId: req.params.id,
      userId: userIdOf(req),
      text: req.body.text,
    });

    return res.status(201).json({ success: true, message });
  } catch (error) {
    return fail(res, error, "AstroChat sendMessage");
  }
};

// =====================================================
// ADMIN
// =====================================================

const pricingPreview = (rate, percent) => {
  try {
    const split = pricing.splitAmount(rate, percent);
    return {
      userPaysPerMinute: split.gross,
      astrologerGetsPerMinute: split.astrologer,
      adminGetsPerMinute: split.commission,
    };
  } catch (_) {
    return null;
  }
};

// GET /astro-chat/admin/astrologers
exports.adminListAstrologers = async (req, res) => {
  try {
    const vendors = await Vendor.find({ role: "astrologer" })
      .select("name phone status isOnline chatRate commissionPercentage")
      .sort({ name: 1 })
      .lean();

    const config = await Commission.findOne({ serviceType: "chat", isActive: true }).lean();

    return res.json({
      success: true,
      count: vendors.length,
      globalChatCommissionPercent: config ? config.percentage : null,
      astrologers: vendors.map((v) => {
        const effective = pricing.resolveCommissionPercent(
          v.commissionPercentage,
          config && config.percentage,
          service.cfg().defaultCommission
        );

        return {
          id: v._id,
          name: v.name,
          phone: v.phone,
          status: v.status,
          isOnline: Boolean(v.isOnline),
          chatRatePerMinute: v.chatRate || 0,
          commissionPercentOverride:
            v.commissionPercentage === undefined ? null : v.commissionPercentage,
          effectiveCommissionPercent: effective,
          preview: pricingPreview(v.chatRate, effective),
        };
      }),
    });
  } catch (error) {
    return fail(res, error, "AstroChat adminListAstrologers");
  }
};

// PUT /astro-chat/admin/astrologers/:vendorId/pricing
// body: { chatRate?: number, commissionPercent?: number | null }
//   chatRate           -> what the USER pays per minute
//   commissionPercent  -> admin's cut in %, null = use the global default
exports.adminUpdatePricing = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidId(vendorId)) throw new ChatError("Invalid astrologer id");

    const { chatRate, commissionPercent } = req.body;

    if (chatRate === undefined && commissionPercent === undefined) {
      throw new ChatError("Send chatRate and/or commissionPercent");
    }

    const vendor = await Vendor.findOne({ _id: vendorId, role: "astrologer" });
    if (!vendor) throw new ChatError("Astrologer not found", 404);

    if (chatRate !== undefined) {
      const rate = Number(chatRate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 10000) {
        throw new ChatError("chatRate must be a number between 1 and 10000");
      }
      vendor.chatRate = pricing.roundMoney(rate);
    }

    if (commissionPercent !== undefined) {
      if (commissionPercent === null) {
        vendor.commissionPercentage = null;
      } else {
        const percent = pricing.toPercent(commissionPercent);
        if (percent === null) throw new ChatError("commissionPercent must be between 0 and 100");
        vendor.commissionPercentage = percent;
      }
    }

    await vendor.save();

    const effective = await service.resolveCommission(vendor);

    return res.json({
      success: true,
      message: "Pricing updated. It applies to NEW chats; running chats keep their old price.",
      astrologer: {
        id: vendor._id,
        name: vendor.name,
        chatRatePerMinute: vendor.chatRate,
        commissionPercentOverride: vendor.commissionPercentage,
        effectiveCommissionPercent: effective,
        preview: pricingPreview(vendor.chatRate, effective),
      },
    });
  } catch (error) {
    return fail(res, error, "AstroChat adminUpdatePricing");
  }
};

// GET /astro-chat/admin/sessions?status=&astrologerId=&customerId=&page=&limit=
exports.adminListSessions = async (req, res) => {
  try {
    const { page, limit, skip } = paging(req);
    const filter = {};

    if (req.query.status) filter.status = String(req.query.status);
    if (isValidId(req.query.astrologerId)) filter.astrologer = req.query.astrologerId;
    if (isValidId(req.query.customerId)) filter.customer = req.query.customerId;

    const [rows, total] = await Promise.all([
      service
        .populateSession(AstroChatSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit))
        .lean(),
      AstroChatSession.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      sessions: rows.map(service.adminView),
    });
  } catch (error) {
    return fail(res, error, "AstroChat adminListSessions");
  }
};

// GET /astro-chat/admin/stats?from=2026-10-01&to=2026-10-31
exports.adminStats = async (req, res) => {
  try {
    const match = { status: { $in: ["active", "ended"] } };

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new ChatError("Invalid from/to date");
    }

    if (from || to) {
      match.startedAt = {};
      if (from) match.startedAt.$gte = from;
      if (to) match.startedAt.$lte = to;
    }

    const [totals, byAstrologer, live] = await Promise.all([
      AstroChatSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            sessions: { $sum: 1 },
            minutes: { $sum: "$billedMinutes" },
            customerPaid: { $sum: "$totalCharged" },
            astrologerEarnings: { $sum: "$astrologerEarning" },
            adminCommission: { $sum: "$adminCommission" },
          },
        },
      ]),
      AstroChatSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$astrologer",
            sessions: { $sum: 1 },
            minutes: { $sum: "$billedMinutes" },
            customerPaid: { $sum: "$totalCharged" },
            astrologerEarnings: { $sum: "$astrologerEarning" },
            adminCommission: { $sum: "$adminCommission" },
          },
        },
        { $sort: { customerPaid: -1 } },
        { $limit: 50 },
      ]),
      AstroChatSession.countDocuments({ status: "active" }),
    ]);

    const names = await Vendor.find({ _id: { $in: byAstrologer.map((r) => r._id) } })
      .select("name")
      .lean();
    const nameOf = new Map(names.map((v) => [String(v._id), v.name]));

    const t = totals[0] || {
      sessions: 0,
      minutes: 0,
      customerPaid: 0,
      astrologerEarnings: 0,
      adminCommission: 0,
    };

    const money = pricing.roundMoney;

    return res.json({
      success: true,
      liveChatsNow: live,
      totals: {
        sessions: t.sessions,
        minutes: t.minutes,
        customerPaid: money(t.customerPaid),
        astrologerEarnings: money(t.astrologerEarnings),
        adminCommission: money(t.adminCommission),
      },
      byAstrologer: byAstrologer.map((r) => ({
        astrologerId: r._id,
        name: nameOf.get(String(r._id)) || "",
        sessions: r.sessions,
        minutes: r.minutes,
        customerPaid: money(r.customerPaid),
        astrologerEarnings: money(r.astrologerEarnings),
        adminCommission: money(r.adminCommission),
      })),
    });
  } catch (error) {
    return fail(res, error, "AstroChat adminStats");
  }
};
