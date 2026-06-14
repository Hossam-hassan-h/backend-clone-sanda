import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: 3000,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
      maxlength: 250,
    },
    start_date: {
      type: Date,
      required: [true, "Start date is required"],
    },
    end_date: {
      type: Date,
    },
    duration: {
      type: Number,
      min: 1,
    },
    salary: {
      type: Number,
      required: [true, "Salary is required"],
      min: 0,
    },
    required_workers: {
      type: Number,
      required: [true, "Required workers is required"],
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Required workers must be an integer",
      },
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "completed", "cancelled"],
      default: "open",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accepted_workers_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    qr_code: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual field: count of applications for this job
jobSchema.virtual("applicants_count", {
  ref: "Application",
  localField: "_id",
  foreignField: "job",
  count: true,
});

// Ensure virtuals are included in JSON/output
jobSchema.set("toObject", { virtuals: true });
jobSchema.set("toJSON", { virtuals: true });

jobSchema.index({ owner: 1, createdAt: -1 });
jobSchema.index({ status: 1, start_date: 1 });
jobSchema.index({ location: 1, status: 1 });

export default mongoose.model("Job", jobSchema);
