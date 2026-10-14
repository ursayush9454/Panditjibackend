const mongoose = require("mongoose");

const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

const getOrCreateWallet = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  let wallet = await Wallet.findOne({
    user: userId,
  });

  if (!wallet) {
    wallet = await Wallet.create({
      user: userId,
      balance: 0,
      lockedBalance: 0,
      status: "active",
    });
  }

  return wallet;
};

const creditWallet = async ({
  userId,
  amount,
  category = "other",
  referenceId,
  booking = null,
  earning = null,
  description = "",
  createdBy = null,
  metadata = {},
}) => {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Credit amount must be greater than zero");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    let wallet = await Wallet.findOne({
      user: userId,
    }).session(session);

    if (!wallet) {
      const created = await Wallet.create(
        [
          {
            user: userId,
            balance: 0,
            lockedBalance: 0,
            status: "active",
          },
        ],
        { session }
      );

      wallet = created[0];
    }

    if (wallet.status !== "active") {
      throw new Error("Wallet is not active");
    }

    if (referenceId) {
      const existing =
        await WalletTransaction.findOne({
          referenceId,
        }).session(session);

      if (existing) {
        await session.commitTransaction();

        return {
          wallet,
          transaction: existing,
          duplicate: true,
        };
      }
    }

    const before = wallet.balance;

    wallet.balance += value;
    wallet.totalCredited += value;
    wallet.lastTransactionAt = new Date();

    await wallet.save({ session });

    const transaction =
      await WalletTransaction.create(
        [
          {
            wallet: wallet._id,
            user: userId,
            type: "credit",
            category,
            amount: value,
            balanceBefore: before,
            balanceAfter: wallet.balance,
            lockedBalanceBefore:
              wallet.lockedBalance,
            lockedBalanceAfter:
              wallet.lockedBalance,
            booking,
            earning,
            referenceId,
            description,
            metadata,
            createdBy,
            status: "completed",
          },
        ],
        { session }
      );

    await session.commitTransaction();

    return {
      wallet,
      transaction: transaction[0],
      duplicate: false,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const debitWallet = async ({
  userId,
  amount,
  category = "other",
  referenceId,
  booking = null,
  description = "",
  createdBy = null,
  metadata = {},
}) => {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Debit amount must be greater than zero");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const wallet =
      await Wallet.findOne({
        user: userId,
      }).session(session);

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.status !== "active") {
      throw new Error("Wallet is not active");
    }

    if (referenceId) {
      const existing =
        await WalletTransaction.findOne({
          referenceId,
        }).session(session);

      if (existing) {
        await session.commitTransaction();

        return {
          wallet,
          transaction: existing,
          duplicate: true,
        };
      }
    }

    if (wallet.balance < value) {
      throw new Error("Insufficient wallet balance");
    }

    const before = wallet.balance;

    wallet.balance -= value;
    wallet.totalDebited += value;
    wallet.lastTransactionAt = new Date();

    await wallet.save({ session });

    const transaction =
      await WalletTransaction.create(
        [
          {
            wallet: wallet._id,
            user: userId,
            type: "debit",
            category,
            amount: value,
            balanceBefore: before,
            balanceAfter: wallet.balance,
            lockedBalanceBefore:
              wallet.lockedBalance,
            lockedBalanceAfter:
              wallet.lockedBalance,
            booking,
            referenceId,
            description,
            metadata,
            createdBy,
            status: "completed",
          },
        ],
        { session }
      );

    await session.commitTransaction();

    return {
      wallet,
      transaction: transaction[0],
      duplicate: false,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  getOrCreateWallet,
  creditWallet,
  debitWallet,
};