import mongoose from "mongoose";

const userLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    target_type: {
      type: String,
      required: true,
      trim: true,
    },
    target_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

userLogSchema.index({ user: 1, createdAt: -1 });
userLogSchema.index({ target_type: 1, target_id: 1 });

export default mongoose.model("UserLog", userLogSchema);
