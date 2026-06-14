import mongoose from "mongoose";
import Application from "../applications/application.model.js";
import Job from "../jobs/job.model.js";
import JobAssignment from "../jobAssignments/jobAssignment.model.js";
import Wallet from "../wallets/wallet.model.js";
import PlatformLedger from "../wallets/platformLedger.model.js";
import Payment from "./payment.model.js";
import StripeEvent from "./stripeEvent.model.js";
import { processRefund } from "./refund.service.js";
import { getStripe, getStripePublishableKey, normalizeStripeError } from "./stripeClient.js";
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

const PLATFORM_FEE_RATE = 0.05;
const DEFAULT_CURRENCY = "egp";
const MINOR_UNITS = 100;

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const toMinorUnits = (amount) => Math.round(roundMoney(amount) * MINOR_UNITS);
const isDuplicateKeyError = (error) => error?.code === 11000;

const withStripeErrorHandling = async (operation) => {
  try {
    return await operation();
  } catch (error) {
    throw normalizeStripeError(error);
  }
};

const assertApplicationExists = (application) => {
  if (!application) throw new AppError("Application not found", 404, statusText.FAIL);
};

const assertJobExists = (job) => {
  if (!job) throw new AppError("Job not found", 404, statusText.FAIL);
};

const formatPaymentIntentResponse = ({ payment, paymentIntent }) => ({
  payment_id: payment._id,
  payment_intent_id: payment.stripe_payment_intent_id,
  client_secret: paymentIntent.client_secret,
  publishable_key: getStripePublishableKey(),
  application: payment.application,
  assignment: payment.assignment,
  job: payment.job,
  worker: payment.worker,
  employer: payment.employer,
  job_amount: payment.job_amount,
  platform_fee: payment.platform_fee,
  total_amount: payment.total_amount,
  currency: payment.currency,
  status: payment.status,
});

export const createPaymentIntentForApplication = async (
  applicationId,
  employerId,
  requestIdempotencyKey = null
) => {
  const existingPayment = await Payment.findOne({
    application: applicationId,
    employer: employerId,
    status: { $in: ["PENDING_PAYMENT", "FUNDS_HELD"] },
  });

  if (existingPayment) {
    const paymentIntent = await withStripeErrorHandling(() =>
      getStripe().paymentIntents.retrieve(existingPayment.stripe_payment_intent_id)
    );

    return formatPaymentIntentResponse({ payment: existingPayment, paymentIntent });
  }

  const application = await Application.findById(applicationId);
  assertApplicationExists(application);

  if (application.status !== "pending") {
    throw new AppError("Application is not pending", 400, statusText.FAIL);
  }

  const job = await Job.findById(application.job).select(
    "_id owner status salary accepted_workers_count required_workers"
  );
  assertJobExists(job);

  if (job.owner.toString() !== employerId) {
    throw new AppError("You are not allowed to accept this application", 403, statusText.FAIL);
  }

  if (job.status !== "open") {
    throw new AppError("Job status does not allow acceptance", 400, statusText.FAIL);
  }

  const jobAmount = roundMoney(job.salary);
  const platformFee = roundMoney(jobAmount * PLATFORM_FEE_RATE);
  const totalAmount = roundMoney(jobAmount + platformFee);
  const currency = (process.env.STRIPE_CURRENCY || DEFAULT_CURRENCY).toLowerCase();
  const idempotencyKey =
    requestIdempotencyKey || `application-payment:${applicationId}:${employerId}`;

  const paymentIntent = await withStripeErrorHandling(() =>
    getStripe().paymentIntents.create(
      {
        amount: toMinorUnits(totalAmount),
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          applicationId: application._id.toString(),
          jobId: job._id.toString(),
          employerId,
          workerId: application.worker.toString(),
          jobAmount: String(jobAmount),
          platformFee: String(platformFee),
        },
      },
      { idempotencyKey }
    )
  );

  const session = await mongoose.startSession();
  let payment;
  let assignment;

  try {
    await session.withTransaction(async () => {
      const reservedJob = await Job.findOneAndUpdate(
        {
          _id: job._id,
          status: "open",
          $expr: { $lt: ["$accepted_workers_count", "$required_workers"] },
        },
        { $inc: { accepted_workers_count: 1 } },
        { new: true, session }
      );

      if (!reservedJob) {
        throw new AppError("Job has reached the required worker capacity", 409, statusText.FAIL);
      }

      const acceptedApplication = await Application.findOneAndUpdate(
        { _id: application._id, status: "pending" },
        { status: "accepted" },
        { new: true, session }
      );

      if (!acceptedApplication) {
        throw new AppError("Application is not pending", 400, statusText.FAIL);
      }

      [assignment] = await JobAssignment.create(
        [
          {
            job: job._id,
            application: application._id,
            worker: application.worker,
            employer: employerId,
            status: "assigned",
            marketplace_status: "PENDING_PAYMENT",
          },
        ],
        { session }
      );

      [payment] = await Payment.create(
        [
          {
            application: application._id,
            assignment: assignment._id,
            job: job._id,
            employer: employerId,
            worker: application.worker,
            stripe_payment_intent_id: paymentIntent.id,
            currency,
            job_amount: jobAmount,
            platform_fee: platformFee,
            total_amount: totalAmount,
            status: "PENDING_PAYMENT",
            idempotency_key: idempotencyKey,
          },
        ],
        { session }
      );

      assignment.payment = payment._id;
      await assignment.save({ session });

      await recordTransaction({
        walletUser: employerId,
        job: job._id,
        payment: payment._id,
        assignment: assignment._id,
        type: "PAYMENT_INITIATED",
        amount: totalAmount,
        status: "pending",
        description: "Stripe PaymentIntent created for marketplace escrow.",
        idempotencyKey: `PAYMENT_INITIATED:${payment._id}`,
        metadata: { stripePaymentIntentId: paymentIntent.id },
        session,
      });

      await createNotification({
        recipient: application.worker,
        actor: employerId,
        type: "WORKER_ASSIGNED",
        title: "Worker assigned",
        message: "You have been assigned to a job. Payment is pending confirmation.",
        entityType: "job_assignment",
        entityId: assignment._id,
        job: job._id,
        deduplicationKey: `worker_assigned:${assignment._id}`,
        session,
      });
    });
  } catch (error) {
    const persistedPayment = await Payment.exists({
      stripe_payment_intent_id: paymentIntent.id,
    });

    if (!persistedPayment) {
      await withStripeErrorHandling(() => getStripe().paymentIntents.cancel(paymentIntent.id)).catch(() => {});
    }

    if (isDuplicateKeyError(error)) {
      throw new AppError("Payment is already in progress", 409, statusText.FAIL);
    }

    throw error;
  } finally {
    session.endSession();
  }

  return formatPaymentIntentResponse({ payment, paymentIntent });
};

export const handlePaymentSucceeded = async (paymentIntent) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        {
          stripe_payment_intent_id: paymentIntent.id,
          status: "PENDING_PAYMENT",
        },
        {
          status: "FUNDS_HELD",
          succeeded_at: new Date(),
          stripe_charge_id:
            typeof paymentIntent.latest_charge === "string"
              ? paymentIntent.latest_charge
              : paymentIntent.latest_charge?.id || null,
        },
        { new: true, runValidators: true, session }
      );

      if (!payment) {
        return;
      }

      await JobAssignment.findOneAndUpdate(
        { _id: payment.assignment, marketplace_status: "PENDING_PAYMENT" },
        { marketplace_status: "FUNDS_HELD", payment: payment._id },
        { session }
      );

      await Job.findByIdAndUpdate(payment.job, { status: "in_progress" }, { session });
      await ensureWallet(payment.worker, session);
      await ensurePlatformLedger(session);

      await Promise.all([
        Wallet.updateOne(
          { user: payment.worker },
          { $inc: { pending_balance: payment.job_amount } },
          { session }
        ),
        PlatformLedger.updateOne(
          { key: "platform" },
          { $inc: { escrow_balance: payment.total_amount } },
          { session }
        ),
      ]);

      await recordTransaction({
        walletUser: payment.employer,
        job: payment.job,
        payment: payment._id,
        assignment: payment.assignment,
        type: "FUNDS_HELD",
        amount: payment.total_amount,
        description: "Employer payment captured and held in platform escrow.",
        idempotencyKey: `FUNDS_HELD:${payment._id}`,
        metadata: { stripePaymentIntentId: paymentIntent.id },
        session,
      });

      for (const recipient of [payment.employer, payment.worker]) {
        await createNotification({
          recipient,
          actor: recipient.toString() === payment.employer.toString() ? payment.worker : payment.employer,
          type: "PAYMENT_HELD",
          title: recipient.toString() === payment.employer.toString() ? "Payment secured" : "Job payment secured",
          message: recipient.toString() === payment.employer.toString()
            ? "Your payment is now held in escrow."
            : "The job payment is held in escrow.",
          entityType: "job_assignment",
          entityId: payment.assignment,
          job: payment.job,
          deduplicationKey: `payment_held:${payment._id}:${recipient}`,
          session,
        });
      }
    });
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) throw createNotificationPersistenceError();
    throw error;
  } finally {
    session.endSession();
  }
};

export const handlePaymentFailed = async (paymentIntent) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        {
          stripe_payment_intent_id: paymentIntent.id,
          status: "PENDING_PAYMENT",
        },
        {
          status: "PAYMENT_FAILED",
          failure_reason:
            paymentIntent.last_payment_error?.message || "Stripe payment failed",
        },
        { new: true, runValidators: true, session }
      );

      if (!payment) return;

      await JobAssignment.findByIdAndUpdate(
        payment.assignment,
        { status: "cancelled", marketplace_status: "PAYMENT_FAILED" },
        { session }
      );

      await Application.findByIdAndUpdate(
        payment.application,
        { status: "pending" },
        { session }
      );

      const capacityRelease = await Job.updateOne(
        {
          _id: payment.job,
          accepted_workers_count: { $gt: 0 },
        },
        { $inc: { accepted_workers_count: -1 } },
        { session }
      );

      if (capacityRelease.modifiedCount !== 1) {
        throw new AppError("Job capacity cannot be released", 409, statusText.FAIL);
      }

      await createNotification({
        recipient: payment.employer,
        actor: payment.worker,
        type: "PAYMENT_FAILED",
        title: "Payment failed",
        message: "The worker was not assigned because payment failed.",
        entityType: "job_assignment",
        entityId: payment.assignment,
        job: payment.job,
        deduplicationKey: `payment_failed:${payment._id}`,
        session,
      });
    });
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) throw createNotificationPersistenceError();
    throw error;
  } finally {
    session.endSession();
  }
};

export const processStripeWebhook = async (event) => {
  let stripeEvent;

  try {
    stripeEvent = await StripeEvent.findOneAndUpdate(
      { event_id: event.id },
      { $setOnInsert: { event_id: event.id, type: event.type, processed_at: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    stripeEvent = await StripeEvent.findOne({ event_id: event.id });
  }

  if (!stripeEvent || stripeEvent.processed_at) return { duplicate: true };

  const claimedEvent = await StripeEvent.findOneAndUpdate(
    {
      _id: stripeEvent._id,
      processed_at: null,
      processing_started_at: null,
    },
    {
      processing_started_at: new Date(),
      last_error: "",
    },
    { new: true }
  );

  if (!claimedEvent) return { duplicate: true, processing: true };

  try {
    if (event.type === "payment_intent.succeeded") {
      await handlePaymentSucceeded(event.data.object);
    }

    if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(event.data.object);
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      const refund = charge.refunds?.data?.[0];

      if (paymentIntentId) {
        await processRefund({ paymentIntentId, refundId: refund?.id || null });
      }
    }

    claimedEvent.processed_at = new Date();
    claimedEvent.processing_started_at = null;
    claimedEvent.last_error = "";
    await claimedEvent.save();

    return { duplicate: false };
  } catch (error) {
    await StripeEvent.findByIdAndUpdate(claimedEvent._id, {
      processing_started_at: null,
      last_error: error.message || "Webhook processing failed",
    });

    throw error;
  }
};

export const syncPaymentIntent = async (paymentIntentId, employerId) => {
  const payment = await Payment.findOne({
    stripe_payment_intent_id: paymentIntentId,
    employer: employerId,
  });

  if (!payment) throw new AppError("Payment not found", 404, statusText.FAIL);

  const paymentIntent = await withStripeErrorHandling(() =>
    getStripe().paymentIntents.retrieve(paymentIntentId)
  );

  if (paymentIntent.status === "succeeded") await handlePaymentSucceeded(paymentIntent);
  if (paymentIntent.status === "requires_payment_method") await handlePaymentFailed(paymentIntent);

  return await Payment.findById(payment._id).select("-__v").lean();
};

export const getPaymentStatus = async (paymentId, userId) => {
  const payment = await Payment.findById(paymentId).select("-__v").lean();

  if (!payment) throw new AppError("Payment not found", 404, statusText.FAIL);

  if (payment.employer.toString() !== userId && payment.worker.toString() !== userId) {
    throw new AppError("You are not allowed to access this payment", 403, statusText.FAIL);
  }

  return payment;
};
