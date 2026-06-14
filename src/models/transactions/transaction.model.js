import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    wallet_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "hold",
        "release",
        "withdraw",
        "deposit",
        "refund",
        "PAYMENT_INITIATED",
        "FUNDS_HELD",
        "CHECK_IN_CONFIRMED",
        "REFUND_PROCESSED",
        "RELEASE_TO_WORKER",
        "PLATFORM_FEE_COLLECTED",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobAssignment",
      default: null,
    },
    idempotency_key: {
      type: String,
      trim: true,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

transactionSchema.index({ wallet_user: 1, createdAt: -1 });
transactionSchema.index({ type: 1 });
transactionSchema.index(
  { idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: "string" } } }
);

export default mongoose.model("Transaction", transactionSchema);
