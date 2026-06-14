import express from "express";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import { validate } from "../../middlewares/validate.js";
import { WithdrawSchema } from "./wallet.validation.js";
import {
  getBalance,
  getPlatformBalance,
  getTransactions,
  withdraw,
} from "./wallet.controller.js";

const walletRoutes = express.Router();

walletRoutes.get("/balance", verifyAccess, getBalance);
walletRoutes.get("/transactions", verifyAccess, getTransactions);
walletRoutes.post("/withdraw", verifyAccess, validate(WithdrawSchema), withdraw);
walletRoutes.get(
  "/platform",
  verifyAccess,
  allowTo("admin"),
  getPlatformBalance
);

export default walletRoutes;
