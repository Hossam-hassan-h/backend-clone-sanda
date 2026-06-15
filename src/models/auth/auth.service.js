import User from "../users/users.model.js";
import RefreshToken from "./refreshToken.model.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";
import { hashPassword, comparePassword } from "../../utils/bcrypt.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";
import crypto from "crypto";
import { sendEmail } from "../../utils/mails.js";

const OTP_COOLDOWN_MS =
  Number(process.env.PASSWORD_RESET_OTP_COOLDOWN_SECONDS || 60) * 1000;
const OTP_EXPIRES_MS =
  Number(process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES || 10) * 60 * 1000;
const otpRateLimitStore = new Map();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const generatePasswordResetOtp = () =>
  crypto.randomInt(100000, 1000000).toString();

const getRateLimitRemainingMs = (email, lastSentAt = null) => {
  const now = Date.now();
  const memoryLastSentAt = otpRateLimitStore.get(email) || 0;
  const dbLastSentAt = lastSentAt ? new Date(lastSentAt).getTime() : 0;
  const lastSent = Math.max(memoryLastSentAt, dbLastSentAt);
  const remaining = OTP_COOLDOWN_MS - (now - lastSent);
  return Math.max(0, remaining);
};


export const login = async (email, password) => {
  const user = await User.findOne({ email: normalizeEmail(email) }).select("+password");

  if (!user) {
    throw new AppError("Invalid email", 401, statusText.FAIL);
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new AppError("Invalid password", 401, statusText.FAIL);
  }
  if (user.role !== "admin" && user.confirmedMail === false) {
    throw new AppError("Please verify your email before logging in.", 403, statusText.FAIL);
  }

  if (user.is_active === false || user.worker_state === "BLOCKED") {
    throw new AppError("Your account is blocked. Please contact support.", 403, statusText.FAIL);
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    user: user._id,
    token: refreshToken,
    expiresAt,
  });

  const userObj = user.toObject();
  delete userObj.password;

  return {
    user: userObj,
    userId: user._id,
    role: user.role,
    accessToken,
    refreshToken,
  };
};

export const refreshToken = async (refreshToken) => {
  const payload = verifyRefreshToken(refreshToken);
  const userId = payload.userId;

  const tokenRecord = await RefreshToken.findOne({ token: refreshToken });
  if (!tokenRecord) {
    throw new AppError("Invalid refresh token", 401, statusText.FAIL);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404, statusText.FAIL);
  }

  const newAccessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken(user._id);

  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await RefreshToken.findByIdAndUpdate(tokenRecord._id, {
    token: newRefreshToken,
    expiresAt: newExpiresAt,
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

export const logout = async (userId) => {
  await RefreshToken.deleteMany({ user: userId });

  return {
    message: "Logged out successfully",
  };
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new AppError("User not found", 404, statusText.FAIL);
  }

  const isPasswordValid = await comparePassword(currentPassword, user.password);
  if (!isPasswordValid) {
    throw new AppError("Current password is incorrect", 401, statusText.FAIL);
  }

  const hashedPassword = await hashPassword(newPassword);

  user.password = hashedPassword;
  await user.save();

  await RefreshToken.deleteMany({ user: userId });

  return {
    message: "Password changed successfully",
  };
};

export const forgotPassword = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordResetOtp +passwordResetExpire +passwordResetLastSentAt"
  );

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);

  const remainingMs = getRateLimitRemainingMs(
    normalizedEmail,
    user.passwordResetLastSentAt
  );

  if (remainingMs > 0) {
    throw new AppError(
      `Please wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another OTP`,
      429,
      statusText.FAIL
    );
  }

  const otp = generatePasswordResetOtp();
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - OTP_COOLDOWN_MS);

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      $or: [
        { passwordResetLastSentAt: null },
        { passwordResetLastSentAt: { $exists: false } },
        { passwordResetLastSentAt: { $lte: cooldownCutoff } },
      ],
    },
    {
      $set: {
        passwordResetOtp: hashOtp(otp),
        passwordResetExpire: new Date(now.getTime() + OTP_EXPIRES_MS),
        passwordResetLastSentAt: now,
      },
    },
    { new: true }
  );

  if (!updatedUser) {
    throw new AppError("Please wait before requesting another OTP", 429, statusText.FAIL);
  }

  otpRateLimitStore.set(normalizedEmail, now.getTime());

  try {
    await sendEmail(
      normalizedEmail,
      "Reset Password OTP",
      [
        `<div style="font-family:Arial,sans-serif;line-height:1.5">`,
        "<h2>Password reset code</h2>",
        "<p>Your verification code is:</p>",
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>`,
        `<p>This code expires in ${Math.round(OTP_EXPIRES_MS / 60000)} minutes.</p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
        "</div>",
      ].join("")
    );
  } catch (error) {
    await User.findByIdAndUpdate(user._id, {
      $set: {
        passwordResetOtp: null,
        passwordResetExpire: null,
        passwordResetLastSentAt: null,
      },
    });
    otpRateLimitStore.delete(normalizedEmail);
    throw new AppError(
      "Email service failed to send password reset code",
      502,
      statusText.FAIL
    );
  }

  return { message: "OTP sent" };
};

export const resetPassword = async (email, otp, newPassword) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password +passwordResetOtp +passwordResetExpire +passwordResetLastSentAt"
  );

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);

  if (!user.passwordResetOtp || !user.passwordResetExpire) {
    throw new AppError("Invalid OTP", 400, statusText.FAIL);
  }

  if (user.passwordResetExpire.getTime() < Date.now()) {
    user.passwordResetOtp = null;
    user.passwordResetExpire = null;
    await user.save();
    throw new AppError("Expired OTP", 400, statusText.FAIL);
  }

  if (user.passwordResetOtp !== hashOtp(otp)) {
    throw new AppError("Invalid OTP", 400, statusText.FAIL);
  }

  user.password = await hashPassword(newPassword);
  user.passwordResetOtp = null;
  user.passwordResetExpire = null;
  user.passwordResetLastSentAt = null;

  await user.save();
  otpRateLimitStore.delete(normalizedEmail);

  await RefreshToken.deleteMany({ user: user._id });

  return { message: "Password updated" };
};
