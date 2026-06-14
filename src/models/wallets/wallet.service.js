import Wallet from "./wallet.model.js";
import PlatformLedger from "./platformLedger.model.js";
import Transaction from "../transactions/transaction.model.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

export const ensureWallet = async (userId, session = null) =>
  await Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { available_balance: 0, pending_balance: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );

export const ensurePlatformLedger = async (session = null) =>
  await PlatformLedger.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { escrow_balance: 0, fee_revenue: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );

export const recordTransaction = async ({
  walletUser,
  job = null,
  payment = null,
  assignment = null,
  type,
  amount,
  status = "completed",
  description = "",
  idempotencyKey,
  metadata = {},
  session = null,
}) =>
  await Transaction.findOneAndUpdate(
    { idempotency_key: idempotencyKey },
    {
      $setOnInsert: {
        wallet_user: walletUser,
        job,
        payment,
        assignment,
        type,
        amount,
        status,
        description,
        idempotency_key: idempotencyKey,
        metadata,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      session,
    }
  );

export const getWalletBalance = async (userId) => {
  const wallet = await ensureWallet(userId);

  return {
    available_balance: wallet.available_balance,
    pending_balance: wallet.pending_balance,
    available: wallet.available_balance,
    held: wallet.pending_balance,
  };
};

export const getWalletTransactions = async (userId) =>
  await Transaction.find({ wallet_user: userId })
    .sort({ createdAt: -1 })
    .populate("job", "title")
    .select("-__v -idempotency_key")
    .lean();

export const getPlatformBalance = async () => {
  const ledger = await ensurePlatformLedger();
  return {
    escrow_balance: ledger.escrow_balance,
    fee_revenue: ledger.fee_revenue,
  };
};

export const withdraw = async () => {
  throw new AppError("Withdrawals are not implemented yet", 501, statusText.FAIL);
};
