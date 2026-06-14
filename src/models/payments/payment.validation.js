import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

export const ApplicationPaymentParamsSchema = z
  .object({
    applicationId: objectIdSchema,
  })
  .strict();

export const PaymentIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const PaymentIntentParamsSchema = z
  .object({
    paymentIntentId: z.string().trim().min(8),
  })
  .strict();

export const AssignmentRefundParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();
