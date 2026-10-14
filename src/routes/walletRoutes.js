const express = require("express");

const router = express.Router();

const auth = require("../middleware/auth");
const role = require("../middleware/role");
const controller = require("../controllers/walletController");

router.get(
  "/",
  auth,
  controller.getWallet
);

router.get(
  "/balance",
  auth,
  controller.getBalance
);

router.get(
  "/transactions",
  auth,
  controller.getTransactions
);

router.get(
  "/transactions/:id",
  auth,
  controller.getTransaction
);

/*
  These are currently protected by authentication.
  Later they can be restricted further to admin/internal
  operations when payment gateway is implemented.
*/
router.post(
  "/credit",
  auth, role("admin"),
  controller.credit
);

router.post(
  "/debit",
  auth, role("admin"),
  controller.debit
);

module.exports = router;