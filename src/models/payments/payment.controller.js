import * as paymentService from "./payment.service.js";
import { requestRefund } from "./refund.service.js";
import { getStripe } from "./stripeClient.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";

export const createApplicationPaymentIntent = catchError(async (req, res) => {
  const paymentIntent = await paymentService.createPaymentIntentForApplication(
    req.params.applicationId,
    req.user.userId,
    req.headers["idempotency-key"] || null
  );

  res.status(201).json({
    status: statusText.SUCCESS,
    data: paymentIntent,
  });
});

export const syncPaymentIntent = catchError(async (req, res) => {
  const payment = await paymentService.syncPaymentIntent(
    req.params.paymentIntentId,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: payment,
  });
});

export const getPaymentStatus = catchError(async (req, res) => {
  const payment = await paymentService.getPaymentStatus(
    req.params.id,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: payment,
  });
});

export const refundAssignment = catchError(async (req, res) => {
  const assignment = await requestRefund(req.params.id, req.user.userId);

  res.json({
    status: statusText.SUCCESS,
    data: assignment,
  });
});

export const stripeWebhook = async (req, res, next) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ error: "Webhook secret is not configured" });
  }

  if (!signature) {
    console.warn("Stripe webhook rejected: missing stripe-signature header");
    return res.status(400).json({ error: "Missing Stripe signature" });
  }

  let event;

  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.warn(`Stripe webhook signature verification failed: ${error.message}`);
    return res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }

  try {
    console.log(`Stripe webhook received: ${event.type} (${event.id})`);
    const result = await paymentService.processStripeWebhook(event);
    console.log(
      `Stripe webhook processed: ${event.type} (${event.id}) duplicate=${Boolean(result?.duplicate)}`
    );

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error(`Stripe webhook processing failed: ${event.type} (${event.id})`, error);
    return next(error);
  }
};
