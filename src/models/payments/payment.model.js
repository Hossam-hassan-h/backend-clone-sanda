import mongoose from "mongoose";

export const PAYMENT_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "FUNDS_HELD",
  "REFUNDING",
  "REFUNDED",
  "RELEASED",
];

const paymentSchema = new mongoose.Schema(
  {
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobAssignment",
      default: null,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stripe_payment_intent_id: {
      type: String,
      required: true,
      unique: true,
    },
    stripe_charge_id: {
      type: String,
      default: null,
    },
    stripe_refund_id: {
      type: String,
      default: null,
    },
    currency: {
      type: String,
      default: "egp",
      lowercase: true,
    },
    job_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    platform_fee: {
      type: Number,
      required: true,
      min: 0,
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "PENDING_PAYMENT",
    },
    succeeded_at: {
      type: Date,
      default: null,
    },
    refunded_at: {
      type: Date,
      default: null,
    },
    released_at: {
      type: Date,
      default: null,
    },
    failure_reason: {
      type: String,
      default: "",
      maxlength: 500,
    },
    idempotency_key: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ application: 1, status: 1 });
paymentSchema.index({ assignment: 1 });
paymentSchema.index({ employer: 1, createdAt: -1 });
paymentSchema.index({ worker: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);
