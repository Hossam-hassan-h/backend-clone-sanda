import mongoose from "mongoose";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
import Payment from "./payment.model.js";
import Wallet from "../wallets/wallet.model.js";
import PlatformLedger from "../wallets/platformLedger.model.js";
import { getStripe } from "./stripeClient.js";
import { recordTransaction } from "../wallets/wallet.service.js";
import {
  createNotification,
  createNotificationPersistenceError,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

const SAFE_WORKER_FIELDS = "name role profile_image bio";
const SAFE_EMPLOYER_FIELDS = "name role profile_image bio";
const SAFE_JOB_FIELDS = "title category location status start_date end_date salary";

const assertAssignmentExists = (assignment) => {
  if (!assignment) throw new AppError("Assignment not found", 404, statusText.FAIL);
};

const getPopulatedAssignment = async (assignmentId) =>
  await JobAssignment.findById(assignmentId)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .populate("employer", SAFE_EMPLOYER_FIELDS)
    .select("-__v -attendance_token_generation_locks")
    .lean();

export const processRefund = async ({ paymentIntentId, refundId = null, requestedBy = null }) => {
  const session = await mongoose.startSession();
  let updatedAssignmentId = null;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        {
          stripe_payment_intent_id: paymentIntentId,
          status: { $in: ["FUNDS_HELD", "REFUNDING"] },
        },
        {
          status: "REFUNDED",
          refunded_at: new Date(),
          stripe_refund_id: refundId,
        },
        { new: true, runValidators: true, session }
      );

      if (!payment) {
        const existingPayment = await Payment.findOne({ stripe_payment_intent_id: paymentIntentId })
          .select("_id assignment status")
          .session(session);

        if (!existingPayment || existingPayment.status === "REFUNDED") {
          if (existingPayment) updatedAssignmentId = existingPayment.assignment;
          return;
        }

        throw new AppError("Payment cannot be refunded", 400, statusText.FAIL);
      }

      const walletUpdate = await Wallet.updateOne(
        { user: payment.worker, pending_balance: { $gte: payment.job_amount } },
        { $inc: { pending_balance: -payment.job_amount } },
        { session }
      );

      if (walletUpdate.modifiedCount !== 1) {
        throw new AppError("Insufficient pending balance", 409, statusText.FAIL);
      }

      const platformUpdate = await PlatformLedger.updateOne(
        { key: "platform", escrow_balance: { $gte: payment.total_amount } },
        { $inc: { escrow_balance: -payment.total_amount } },
        { session }
      );

      if (platformUpdate.modifiedCount !== 1) {
        throw new AppError("Insufficient escrow balance", 409, statusText.FAIL);
      }

      await JobAssignment.findByIdAndUpdate(
        payment.assignment,
        { status: "cancelled", marketplace_status: "REFUNDED" },
        { session }
      );

      await recordTransaction({
        walletUser: payment.employer,
        job: payment.job,
        payment: payment._id,
        assignment: payment.assignment,
        type: "REFUND_PROCESSED",
        amount: payment.total_amount,
        description: "Stripe refund processed and escrow reversed.",
        idempotencyKey: `REFUND_PROCESSED:${payment._id}`,
        metadata: { stripeRefundId: refundId },
        session,
      });

      for (const recipient of [payment.employer, payment.worker]) {
        await createNotification({
          recipient,
          actor: requestedBy || payment.employer,
          type: "REFUND_SUCCESS",
          title: "Refund processed",
          message: "The payment was refunded and escrow was reversed.",
          entityType: "job_assignment",
          entityId: payment.assignment,
          job: payment.job,
          deduplicationKey: `refund_success:${payment._id}:${recipient}`,
          session,
        });
      }

      updatedAssignmentId = payment.assignment;
    });

    return updatedAssignmentId ? await getPopulatedAssignment(updatedAssignmentId) : null;
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) throw createNotificationPersistenceError();
    throw error;
  } finally {
    session.endSession();
  }
};

export const requestRefund = async (assignmentId, employerId) => {
  const assignment = await JobAssignment.findById(assignmentId).select(
    "_id employer marketplace_status payment status checked_in_at"
  );
  assertAssignmentExists(assignment);

  if (assignment.employer.toString() !== employerId) {
    throw new AppError("You are not allowed to refund this assignment", 403, statusText.FAIL);
  }

  if (!assignment.checked_in_at) {
    throw new AppError("Refund is only allowed after the worker has checked in", 400, statusText.FAIL);
  }

  const checkInTime = new Date(assignment.checked_in_at).getTime();
  const thirtyMinutes = 30 * 60 * 1000;
  if (Date.now() - checkInTime > thirtyMinutes) {
    throw new AppError("Refund request window has expired (30 minutes from check-in)", 400, statusText.FAIL);
  }

  if (assignment.status === "completed" || assignment.marketplace_status === "RELEASED") {
    throw new AppError("Payment has already been released", 409, statusText.FAIL);
  }

  const payment = await Payment.findById(assignment.payment);
  if (!payment || !["FUNDS_HELD", "REFUNDING"].includes(payment.status)) {
    throw new AppError("Payment is not refundable", 400, statusText.FAIL);
  }

  if (payment.status === "FUNDS_HELD") {
    const lockedPayment = await Payment.findOneAndUpdate(
      { _id: payment._id, status: "FUNDS_HELD" },
      { status: "REFUNDING" },
      { new: true }
    );

    if (!lockedPayment) {
      throw new AppError("Refund is already in progress", 409, statusText.FAIL);
    }
  }

  let refund;

  try {
    refund = await getStripe().refunds.create(
      {
        payment_intent: payment.stripe_payment_intent_id,
        metadata: {
          paymentId: payment._id.toString(),
          assignmentId: assignment._id.toString(),
        },
      },
      { idempotencyKey: `refund:${payment._id}` }
    );
  } catch (error) {
    if (payment.status === "FUNDS_HELD") {
      await Payment.findOneAndUpdate(
        { _id: payment._id, status: "REFUNDING" },
        { status: "FUNDS_HELD" }
      );
    }

    throw error;
  }

  return await processRefund({
    paymentIntentId: payment.stripe_payment_intent_id,
    refundId: refund.id,
    requestedBy: employerId,
  });
};
