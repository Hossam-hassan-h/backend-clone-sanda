import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reviewed_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stars: {
      type: Number,
      required: [true, "Stars are required"],
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Stars must be an integer",
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

ratingSchema.index(
  {
    job: 1,
    reviewer: 1,
    reviewed_user: 1,
  },
  {
    unique: true,
  }
);

ratingSchema.index({ reviewed_user: 1, createdAt: -1 });
ratingSchema.index({ job: 1, createdAt: -1 });

export default mongoose.model("Rating", ratingSchema);
