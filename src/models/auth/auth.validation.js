import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

export const VerifyEmailSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase().trim()),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export const ForgotPasswordSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase().trim()),
});

export const ResetPasswordSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase().trim()),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  newPassword: z.string().min(8),
});
