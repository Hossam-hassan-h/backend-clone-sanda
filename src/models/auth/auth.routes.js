import express from "express";
import { validate } from "../../middlewares/validate.js";
import verifyAccess from "../../middlewares/verifyAccess.js";
import {
  LoginSchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
  VerifyEmailSchema,
  ResendEmailOtpSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "./auth.validation.js";
import * as authController from "./auth.controller.js";

const authRoutes = express.Router();

authRoutes.post("/login", validate(LoginSchema), authController.login);
authRoutes.post("/refresh", validate(RefreshTokenSchema), authController.refreshToken);
authRoutes.post("/logout", verifyAccess, authController.logout);
authRoutes.put("/change-password", verifyAccess, validate(ChangePasswordSchema), authController.changePassword);
authRoutes.post("/verify-email", validate(VerifyEmailSchema), authController.verifyEmail);
authRoutes.post("/resend-email-otp", validate(ResendEmailOtpSchema), authController.resendEmailOtp);
authRoutes.post("/forgot-password", validate(ForgotPasswordSchema), authController.forgotPassword);
authRoutes.post("/reset-password", validate(ResetPasswordSchema), authController.resetPassword);

export default authRoutes;
