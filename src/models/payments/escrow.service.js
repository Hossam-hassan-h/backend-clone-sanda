import mongoose from "mongoose";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
import Payment from "./payment.model.js";
import Wallet from "../wallets/wallet.model.js";
import PlatformLedger from "../wallets/platformLedger.model.js";
import {
  ensurePlatformLedger,
  ensureWallet,
  recordTransaction,
} from "../wallets/wallet.service.js";
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

const getPopulatedAssignment = async (assignmentId) =>
  await JobAssignment.findById(assignmentId)
    .populate("job", SAFE_JOB_FIELDS)
    .populate("worker", SAFE_WORKER_FIELDS)
    .populate("employer", SAFE_EMPLOYER_FIELDS)
    .select("-__v -attendance_token_generation_locks")
    .lean();

const assertAssignmentExists = (assignment) => {
  if (!assignment) throw new AppError("Assignment not found", 404, statusText.FAIL);
};

export const releaseToWorker = async (assignmentId, employerId) => {
  const session = await mongoose.startSession();
  let updatedId = null;

  try {
    await session.withTransaction(async () => {
      const assignment = await JobAssignment.findById(assignmentId)
        .select("_id job worker employer status marketplace_status payment completed_at checked_out_at")
        .session(session);

      assertAssignmentExists(assignment);

      if (assignment.employer.toString() !== employerId) {
        throw new AppError("You are not allowed to release this payment", 403, statusText.FAIL);
      }

      if (assignment.status !== "in_progress") {
        throw new AppError("Assignment is not in progress", 400, statusText.FAIL);
      }

      const payment = await Payment.findOneAndUpdate(
        { _id: assignment.payment, status: "FUNDS_HELD" },
        { status: "RELEASED", released_at: new Date() },
        { new: true, runValidators: true, session }
      );

      if (!payment) {
        throw new AppError("Payment is not held in escrow", 400, statusText.FAIL);
      }

      await ensureWallet(payment.worker, session);
      await ensurePlatformLedger(session);

      const walletUpdate = await Wallet.updateOne(
        { user: payment.worker, pending_balance: { $gte: payment.job_amount } },
        {
          $inc: {
            pending_balance: -payment.job_amount,
            available_balance: payment.job_amount,
          },
        },
        { session }
      );

      if (walletUpdate.modifiedCount !== 1) {
        throw new AppError("Insufficient pending balance", 409, statusText.FAIL);
      }

      const platformUpdate = await PlatformLedger.updateOne(
        { key: "platform", escrow_balance: { $gte: payment.total_amount } },
        {
          $inc: {
            escrow_balance: -payment.total_amount,
            fee_revenue: payment.platform_fee,
          },
        },
        { session }
      );

      if (platformUpdate.modifiedCount !== 1) {
        throw new AppError("Insufficient escrow balance", 409, statusText.FAIL);
      }

      assignment.status = "completed";
      assignment.marketplace_status = "RELEASED";
      assignment.completed_at = new Date();
      await assignment.save({ session });

      await recordTransaction({
        walletUser: payment.worker,
        job: payment.job,
        payment: payment._id,
        assignment: assignment._id,
        type: "RELEASE_TO_WORKER",
        amount: payment.job_amount,
        description: "Escrow released to worker wallet.",
        idempotencyKey: `RELEASE_TO_WORKER:${payment._id}`,
        session,
      });

      await recordTransaction({
        walletUser: payment.employer,
        job: payment.job,
        payment: payment._id,
        assignment: assignment._id,
        type: "PLATFORM_FEE_COLLECTED",
        amount: payment.platform_fee,
        description: "Platform fee collected after assignment completion.",
        idempotencyKey: `PLATFORM_FEE_COLLECTED:${payment._id}`,
        session,
      });

      for (const recipient of [payment.employer, payment.worker]) {
        await createNotification({
          recipient,
          actor: employerId,
          type: "PAYMENT_RELEASED",
          title: "Payment released",
          message: "The assignment payment has been released.",
          entityType: "job_assignment",
          entityId: assignment._id,
          job: payment.job,
          deduplicationKey: `payment_released:${payment._id}:${recipient}`,
          session,
        });
      }

      updatedId = assignment._id;
    });

    return await getPopulatedAssignment(updatedId);
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) throw createNotificationPersistenceError();
    throw error;
  } finally {
    session.endSession();
  }
};
