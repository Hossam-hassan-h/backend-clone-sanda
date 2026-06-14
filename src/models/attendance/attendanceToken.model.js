import mongoose from "mongoose";

const attendanceTokenSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ["check_in", "check_out"],
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

attendanceTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

attendanceTokenSchema.index(
  {
    assignment: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      usedAt: null,
      isRevoked: false,
    },
  }
);

attendanceTokenSchema.index({
  assignment: 1,
  type: 1,
  isRevoked: 1,
  usedAt: 1,
  expiresAt: 1,
});

export default mongoose.model("AttendanceToken", attendanceTokenSchema);
