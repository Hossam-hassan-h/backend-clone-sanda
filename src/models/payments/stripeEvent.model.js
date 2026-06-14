import mongoose from "mongoose";

const stripeEventSchema = new mongoose.Schema(
  {
    event_id: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      required: true,
    },
    processed_at: {
      type: Date,
      default: null,
    },
    processing_started_at: {
      type: Date,
      default: null,
    },
    last_error: {
      type: String,
      default: "",
      maxlength: 500,
    },
  },
  { timestamps: true }
);

export default mongoose.model("StripeEvent", stripeEventSchema);
