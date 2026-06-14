import Stripe from "stripe";
import { AppError } from "../../middlewares/appError.js";
import statusText from "../../utils/statusText.js";

let stripe = null;

export const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new AppError("Stripe is not configured", 500, statusText.ERROR);
  }

  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripe;
};

export const getStripePublishableKey = () =>
  process.env.STRIPE_PUBLISHABLE_KEY || "";

export const normalizeStripeError = (error) => {
  if (!error?.type?.startsWith?.("Stripe")) return error;

  const statusCode = error.statusCode || 502;
  const message =
    error.type === "StripeCardError"
      ? error.message
      : "Stripe payment service error";

  return new AppError(message, statusCode, statusText.FAIL);
};
