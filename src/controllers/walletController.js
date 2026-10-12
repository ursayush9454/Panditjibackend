const mongoose = require("mongoose");

const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const {
  getOrCreateWallet,
  creditWallet,
  debitWallet,
} = require("../services/walletService");

const getUserId = (req) => req.user?.id || req.user?._id;

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const getPagination = (req) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 20, 1),
    100
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

/*
  GET WALLET
*/
exports.getWallet = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const wallet = await getOrCreateWallet(userId);

    return res.json({
      success: true,
      wallet,
    });
  } catch (error) {
    console.error("Get Wallet Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch wallet",
    });
  }
};

/*
  GET WALLET BALANCE
*/
exports.getBalance = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const wallet = await getOrCreateWallet(userId);

    return res.json({
      success: true,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      currency: wallet.currency,
    });
  } catch (error) {
    console.error("Get Wallet Balance Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch wallet balance",
    });
  }
};

/*
  GET WALLET TRANSACTIONS
*/
exports.getTransactions = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { page, limit, skip } = getPagination(req);

    const filter = {
      user: userId,
    };

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [transactions, total] =
      await Promise.all([
        WalletTransaction.find(filter)
          .populate("booking")
          .populate("earning")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),

        WalletTransaction.countDocuments(filter),
      ]);

    return res.json({
      success: true,
      count: transactions.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      transactions,
    });
  } catch (error) {
    console.error("Get Wallet Transactions Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch wallet transactions",
    });
  }
};

/*
  GET SINGLE TRANSACTION
*/
exports.getTransaction = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const transaction =
      await WalletTransaction.findOne({
        _id: id,
        user: userId,
      })
        .populate("booking")
        .populate("earning");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error("Get Wallet Transaction Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transaction",
    });
  }
};

/*
  CREDIT WALLET
  Internal/admin-ready endpoint.
*/
exports.credit = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      amount,
      category = "adjustment",
      referenceId,
      description = "",
      metadata = {},
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const result = await creditWallet({
      userId,
      amount,
      category,
      referenceId,
      description,
      createdBy: userId,
      metadata,
    });

    return res.status(
      result.duplicate ? 200 : 201
    ).json({
      success: true,
      message: result.duplicate
        ? "Wallet transaction already processed"
        : "Wallet credited successfully",
      duplicate: result.duplicate,
      wallet: result.wallet,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error("Credit Wallet Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to credit wallet",
    });
  }
};

/*
  DEBIT WALLET
*/
exports.debit = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      amount,
      category = "adjustment",
      referenceId,
      description = "",
      metadata = {},
    } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const result = await debitWallet({
      userId,
      amount,
      category,
      referenceId,
      description,
      createdBy: userId,
      metadata,
    });

    return res.status(
      result.duplicate ? 200 : 201
    ).json({
      success: true,
      message: result.duplicate
        ? "Wallet transaction already processed"
        : "Wallet debited successfully",
      duplicate: result.duplicate,
      wallet: result.wallet,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error("Debit Wallet Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to debit wallet",
    });
  }
};