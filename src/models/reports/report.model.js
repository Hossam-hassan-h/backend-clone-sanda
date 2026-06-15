import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reported_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reported_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["open", "reviewed", "closed"],
      default: "open",
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    review_decision: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    admin_notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reported_user: 1 });
reportSchema.index({ reported_by: 1 });

export default mongoose.model("Report", reportSchema);
