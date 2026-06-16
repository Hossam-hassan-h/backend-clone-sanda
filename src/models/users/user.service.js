
import User from "./users.model.js";
import RefreshToken from "../auth/refreshToken.model.js";
import { hashPassword, comparePassword } from "../../utils/bcrypt.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../utils/jwt.js";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";
import {
  createNotification,
  createNotificationPersistenceError,
  isUnexpectedDuplicateKeyError,
} from "../notifications/notification.service.js";

import cloudinary from '../../uploads/cloudinaryConfig.js';
import { uploadToCloudinary } from "../../uploads/cloudinaryUpload.js";
import crypto from "crypto";
import { sendEmail } from "../../utils/mails.js";
import { generateOtp } from "../../utils/genrateOtp.js";

const EMAIL_OTP_EXPIRES_MS =
  Number(process.env.EMAIL_OTP_EXPIRES_MINUTES || 10) * 60 * 1000;
const EMAIL_OTP_COOLDOWN_MS =
  Number(process.env.EMAIL_OTP_COOLDOWN_SECONDS || 60) * 1000;
const emailOtpRateLimitStore = new Map();

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const buildEmailOtp = () => {
  const otp = generateOtp();
  return {
    otp,
    hashedOtp: hashOtp(otp),
    expiresAt: new Date(Date.now() + EMAIL_OTP_EXPIRES_MS),
  };
};

const sendVerificationEmail = async (to, otp) =>
  sendEmail(
    to,
    "Verify Your Email",
    `<h1>Your OTP is: ${otp}</h1><p>Expires in ${Math.round(EMAIL_OTP_EXPIRES_MS / 60000)} minutes</p>`
  );

const getEmailOtpRateLimitRemainingMs = (email, lastSentAt = null) => {
  const now = Date.now();
  const memoryLastSentAt = emailOtpRateLimitStore.get(email) || 0;
  const dbLastSentAt = lastSentAt ? new Date(lastSentAt).getTime() : 0;
  const lastSent = Math.max(memoryLastSentAt, dbLastSentAt);
  const remaining = EMAIL_OTP_COOLDOWN_MS - (now - lastSent);
  return Math.max(0, remaining);
};

const assertEmailOtpNotRateLimited = (email, lastSentAt = null) => {
  const remainingMs = getEmailOtpRateLimitRemainingMs(email, lastSentAt);
  if (remainingMs > 0) {
    throw new AppError(
      `Please wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another OTP`,
      429,
      statusText.FAIL
    );
  }
};

export const register = async (userData) => {
  if (userData.role === "admin") {
    throw new AppError("Forbidden role", 403, statusText.FAIL);
  }

  const normalizedEmail = String(userData.email || "").trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail }).select("+emailOtpLastSentAt");

  if (existingUser) {
    if (!existingUser.confirmedMail) {
      return await resendEmailOtp(normalizedEmail);
    }
    throw new AppError("Email already in use", 409, statusText.FAIL);
  }

  const hashedPassword = await hashPassword(userData.password);
  const { otp, hashedOtp, expiresAt } = buildEmailOtp();

  const user = await User.create({
    ...userData,
    email: normalizedEmail,
    password: hashedPassword,
    is_active: true,
    isBlocked: false,
    confirmedMail: false,
    emailOtp: hashedOtp,
    emailOtpExpire: expiresAt,
  });

  try {
    await sendVerificationEmail(user.email, otp);
    user.emailOtpLastSentAt = new Date();
    await user.save();
    emailOtpRateLimitStore.set(normalizedEmail, user.emailOtpLastSentAt.getTime());
  } catch (error) {
    console.error(`[SMTP_FAILURE] register: ${error.message}`);
    await User.findByIdAndDelete(user._id);
    throw new AppError(
      "Email service failed to send verification code",
      502,
      statusText.FAIL
    );
  }

  return {
    message: "OTP sent to email",
    userId: user._id,
  };
};

export const resendEmailOtp = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+emailOtp +emailOtpExpire +emailOtpLastSentAt"
  );

  if (!user) {
    throw new AppError("User not found", 404, statusText.FAIL);
  }

  if (user.confirmedMail) {
    throw new AppError("Email is already verified", 400, statusText.FAIL);
  }

  assertEmailOtpNotRateLimited(normalizedEmail, user.emailOtpLastSentAt);

  const { otp, hashedOtp, expiresAt } = buildEmailOtp();
  const sentAt = new Date();
  user.emailOtp = hashedOtp;
  user.emailOtpExpire = expiresAt;
  user.emailOtpLastSentAt = sentAt;
  await user.save();

  try {
    await sendVerificationEmail(user.email, otp);
    emailOtpRateLimitStore.set(normalizedEmail, sentAt.getTime());
  } catch (error) {
    console.error(`[SMTP_FAILURE] resendEmailOtp: ${error.message}`);
    user.emailOtp = null;
    user.emailOtpExpire = null;
    user.emailOtpLastSentAt = null;
    await user.save();
    emailOtpRateLimitStore.delete(normalizedEmail);
    throw new AppError(
      "Email service failed to send verification code",
      502,
      statusText.FAIL
    );
  }

  return { message: "OTP sent to email", email: user.email };
};

export const verifyEmail = async (email, otp) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+emailOtp +emailOtpExpire"
  );

  if (!user) {
    throw new AppError("User not found", 404, statusText.FAIL);
  }

  if (!user.emailOtp || !user.emailOtpExpire) {
    throw new AppError("Invalid or expired OTP", 400, statusText.FAIL);
  }

  const hashedOtp = hashOtp(otp);

  if (user.emailOtpExpire.getTime() < Date.now()) {
    user.emailOtp = null;
    user.emailOtpExpire = null;
    await user.save();
    throw new AppError("Token expired, please request again", 400, statusText.FAIL);
  }

  if (user.emailOtp !== hashedOtp) {
    throw new AppError("Invalid or expired OTP", 400, statusText.FAIL);
  }

  user.confirmedMail = true;
  user.emailOtp = null;
  user.emailOtpExpire = null;

  await user.save();

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
  delete userObj.emailOtp;
  delete userObj.emailOtpExpire;

  return { user: userObj, accessToken, refreshToken };
};
export const getProfile = async (userId) => {
  const user = await User.findById(userId).select("-password");

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);

  return user;
};

export const updateProfile = async (userId, updateData) => {
  const allowedUpdates = ["name", "profile_image", "bio", "city", "skills"];
  const safeUpdateData = Object.fromEntries(
    Object.entries(updateData).filter(([key]) => allowedUpdates.includes(key))
  );

  const user = await User.findByIdAndUpdate(userId, safeUpdateData, {
    new: true,
    runValidators: true,
  });

  if (!user) throw new AppError("User not found", 404, statusText.FAIL);

  const userObj = user.toObject();
  delete userObj.password;

  return userObj;
};

export const getAllUsers = async (filter = {}) => {
  return await User.find(filter,{password:0,__v:0});
};
export const createUser = async (userData) => {
  userData.password = await hashPassword(userData.password);
  const user = await User.create(userData);
  const userObj = user.toObject();
  delete userObj.password;

  return userObj;
};

export const uploadDocuments = async (userId, files) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found", 404, statusText.FAIL);
  }

  const uploadedFiles = [];
  const oldPublicIds = [];
  const incomingFiles = files || {};
  const hasAnyUpload = Object.values(incomingFiles).some((fileList) => fileList?.[0]);
  const hasVerificationDocument =
    !!incomingFiles.nationalIdFront?.[0] ||
    !!incomingFiles.nationalIdBack?.[0] ||
    !!incomingFiles.verificationSelfie?.[0];
  const uploadPlan = [
    { field: "profileImage", folder: "users/profile", path: "profile_image" },
    { field: "nationalIdFront", folder: "users/national-id/front", path: "nationalId.front" },
    { field: "nationalIdBack", folder: "users/national-id/back", path: "nationalId.back" },
    { field: "verificationSelfie", folder: "users/verification-selfie", path: "verificationSelfie" },
  ];

  if (!hasAnyUpload) {
    throw new AppError("No upload files received", 400, statusText.FAIL);
  }

  try {
    for (const item of uploadPlan) {
      const file = incomingFiles[item.field]?.[0];
      if (!file) continue;

      const uploaded = await uploadToCloudinary(file.buffer, item.folder);
      const nextValue = {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
      };

      uploadedFiles.push(uploaded.public_id);
      const previousValue = user.get(item.path);
      if (previousValue?.publicId) oldPublicIds.push(previousValue.publicId);
      user.set(item.path, nextValue);
    }

    if (hasVerificationDocument) {
      user.verification_status = "pending";
    }
    await user.save();
  } catch (error) {
    await Promise.allSettled(uploadedFiles.map((publicId) => cloudinary.uploader.destroy(publicId)));
    throw new AppError(
      "Failed to upload verification documents",
      502,
      statusText.FAIL
    );
  }

  await Promise.allSettled(oldPublicIds.map((publicId) => cloudinary.uploader.destroy(publicId)));

  try {
    const admins = await User.find({ role: "admin", is_active: true }).select("_id");
    for (const admin of admins) {
      await createNotification({
        recipient: admin._id,
        actor: userId,
        type: "verification_request",
        title: "طلب توثيق جديد",
        message: `المستخدم ${user.name} قام برفع وثائقه ويحتاج إلى توثيق`,
        entityType: "user",
        entityId: user._id,
        job: null,
        deduplicationKey: `verification_request:${user._id}:${admin._id}`,
      });
    }
  } catch (error) {
    if (isUnexpectedDuplicateKeyError(error)) {
      throw createNotificationPersistenceError();
    }
  }

  return user;
};


