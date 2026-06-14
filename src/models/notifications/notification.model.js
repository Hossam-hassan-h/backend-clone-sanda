import mongoose from "mongoose";

export const NOTIFICATION_TYPES = [
  "application_created",
  "application_accepted",
  "application_rejected",
  "worker_checked_in",
  "worker_checked_out",
  "assignment_completed",
  "rating_received",
  "message_received",
  "report_created",
  "verification_request",
  "WORKER_ASSIGNED",
  "PAYMENT_HELD",
  "PAYMENT_FAILED",
  "PAYMENT_RELEASED",
  "REFUND_SUCCESS",
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    entity_type: {
      type: String,
      enum: ["application", "job_assignment", "rating", "message", "report", "user"],
      required: true,
    },
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    is_read: {
      type: Boolean,
      default: false,
    },
    read_at: {
      type: Date,
      default: null,
    },
    deduplication_key: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ deduplication_key: 1 }, { unique: true });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, is_read: 1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
