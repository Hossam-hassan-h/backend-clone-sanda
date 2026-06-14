import * as walletService from "./wallet.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const getBalance = catchError(async (req, res) => {
  const balance = await walletService.getWalletBalance(req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: balance,
  });
});

export const getTransactions = catchError(async (req, res) => {
  const transactions = await walletService.getWalletTransactions(req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: transactions,
  });
});

export const getPlatformBalance = catchError(async (req, res) => {
  const balance = await walletService.getPlatformBalance();

  res.json({
    status: statusText.SUCCESS,
    data: balance,
  });
});

export const withdraw = catchError(async (req, res) => {
  await walletService.withdraw(req.user.userId, req.body.amount);

  res.json({
    status: statusText.SUCCESS,
    data: { ok: true },
  });
});
