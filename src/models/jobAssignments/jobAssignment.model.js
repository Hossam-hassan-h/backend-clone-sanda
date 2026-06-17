import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    checked_in_at: { type: Date, default: null },
    checked_out_at: { type: Date, default: null },
    no_show: { type: Boolean, default: false },
  },
  { _id: false }
);

const jobAssignmentSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      unique: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    employer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔵 JOB FLOW (UNCHANGED)
    status: {
      type: String,
      enum: ["assigned", "in_progress", "completed", "cancelled"],
      default: "assigned",
    },

    marketplace_status: {
      type: String,
      enum: [
        "PENDING_PAYMENT",
        "FUNDS_HELD",
        "PAYMENT_FAILED",
        "REFUNDED",
        "RELEASED",
      ],
      default: null,
    },

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    started_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },

    // 🔵 ATTENDANCE LAYER
    attendance: {
      type: attendanceSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

jobAssignmentSchema.index({ job: 1, worker: 1 }, { unique: true });
jobAssignmentSchema.index({ worker: 1, createdAt: -1 });
jobAssignmentSchema.index({ employer: 1, createdAt: -1 });
jobAssignmentSchema.index({ job: 1, status: 1 });
jobAssignmentSchema.index({ marketplace_status: 1, createdAt: -1 });

export default mongoose.model("JobAssignment", jobAssignmentSchema);    },
    attendance_token_generation_locks: {
      type: attendanceTokenGenerationLocksSchema,
      default: () => ({}),
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

jobAssignmentSchema.index({ job: 1, worker: 1 }, { unique: true });
jobAssignmentSchema.index({ worker: 1, createdAt: -1 });
jobAssignmentSchema.index({ employer: 1, createdAt: -1 });
jobAssignmentSchema.index({ job: 1, status: 1 });
jobAssignmentSchema.index({ marketplace_status: 1, createdAt: -1 });

export default mongoose.model("JobAssignment", jobAssignmentSchema);
