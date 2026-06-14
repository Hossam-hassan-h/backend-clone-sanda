import mongoose from "mongoose";

const platformLedgerSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "platform",
      unique: true,
      immutable: true,
    },
    escrow_balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    fee_revenue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("PlatformLedger", platformLedgerSchema);
