import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

export const CreateApplicationSchema = z
  .object({
    message: z
      .string()
      .trim()
      .max(1000, "Message cannot exceed 1000 characters")
      .optional(),
  })
  .strict();

export const ApplicationIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const JobIdParamsSchema = z
  .object({
    jobId: objectIdSchema,
  })
  .strict();

export const ApplicationStatusSchema = z
  .object({
    status: z.enum(["accepted", "rejected"]),
  })
  .strict();

export const ApplicationListingQuerySchema = z
  .object({
    status: z.enum(["pending", "accepted", "rejected", "cancelled"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
