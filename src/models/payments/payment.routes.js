import express from "express";
import verifyAccess from "../../middlewares/verifyAccess.js";
import allowTo from "../../middlewares/allowTo.js";
import { validate } from "../../middlewares/validate.js";
import {
  ApplicationPaymentParamsSchema,
  AssignmentRefundParamsSchema,
  PaymentIdParamsSchema,
  PaymentIntentParamsSchema,
} from "./payment.validation.js";
import {
  createApplicationPaymentIntent,
  getPaymentStatus,
  refundAssignment,
  syncPaymentIntent,
} from "./payment.controller.js";

const paymentRoutes = express.Router();

paymentRoutes.post(
  "/job-assignments/:id/refund",
  verifyAccess,
  allowTo("employer"),
  validate(AssignmentRefundParamsSchema, "params"),
  refundAssignment
);

paymentRoutes.post(
  "/applications/:applicationId/payment-intent",
  verifyAccess,
  allowTo("employer"),
  validate(ApplicationPaymentParamsSchema, "params"),
  createApplicationPaymentIntent
);

paymentRoutes.post(
  "/payment-intents/:paymentIntentId/sync",
  verifyAccess,
  allowTo("employer"),
  validate(PaymentIntentParamsSchema, "params"),
  syncPaymentIntent
);

paymentRoutes.get(
  "/:id",
  verifyAccess,
  validate(PaymentIdParamsSchema, "params"),
  getPaymentStatus
);

export default paymentRoutes;
