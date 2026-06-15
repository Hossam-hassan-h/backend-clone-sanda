import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: ["admin", "employer", "worker"],
      default: "employer",
    },

  profile_image: {
  url: {
    type: String,
    default: null,
  },
  publicId: {
    type: String,
    default: null,
  },
},


    phone: {
      type: String,
      default: "",
    },

    bio: {
      type: String,
      maxlength: 500,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },

    skills: [{ type: String }],
  nationalId: {
  front: {
    url: String,
    publicId: String,
  },

  back: {
    url: String,
    publicId: String,
  },
},

    is_active: {
      type: Boolean,
      default: true,
    },

    is_verified: {
      type: Boolean,
      default: false,
    },

    verification_status: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },

    worker_state: {
      type: String,
      enum: ["AVAILABLE", "ASSIGNED", "ACTIVE_ON_JOB", "COMPLETED", "SUSPENDED", "BLOCKED"],
      default: "AVAILABLE",
    },

    suspension_until: {
      type: Date,
      default: null,
    },

    admin_notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    confirmedMail: {
      type: Boolean,
      default: false,
    },

    emailOtp: {
      type: String,
      default: null,
      select: false,
    },

    emailOtpExpire: {
      type: Date,
      default: null,
      select: false,
    },

    emailOtpLastSentAt: {
      type: Date,
      default: null,
      select: false,
    },

    passwordResetOtp: {
      type: String,
      default: null,
      select: false,
    },

    passwordResetExpire: {
      type: Date,
      default: null,
      select: false,
    },

    passwordResetLastSentAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", userSchema);
