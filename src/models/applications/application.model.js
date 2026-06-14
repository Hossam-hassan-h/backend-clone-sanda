import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

applicationSchema.index(
  {
    job: 1,
    worker: 1,
  },
  {
    unique: true,
  }
);

applicationSchema.index({ worker: 1, createdAt: -1 });
applicationSchema.index({ job: 1, status: 1 });

export default mongoose.model("Application", applicationSchema);
