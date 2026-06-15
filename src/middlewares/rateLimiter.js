import rateLimit from "express-rate-limit";

export const qrScanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { status: "fail", message: "Too many scan attempts, please try again after 60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const qrGenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { status: "fail", message: "Too many QR generation attempts, please try again after 60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});
