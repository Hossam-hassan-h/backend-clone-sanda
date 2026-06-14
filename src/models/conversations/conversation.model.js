import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobAssignment",
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
    last_message: {
      type: String,
      default: "",
      maxlength: 500,
    },
    last_message_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ assignment: 1 }, { unique: true });
conversationSchema.index({ employer: 1, last_message_at: -1 });
conversationSchema.index({ worker: 1, last_message_at: -1 });
conversationSchema.index({ job: 1 });

export default mongoose.model("Conversation", conversationSchema);
