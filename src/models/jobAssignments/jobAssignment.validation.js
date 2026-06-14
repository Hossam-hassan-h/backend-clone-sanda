import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

export const JobAssignmentIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const JobIdParamsSchema = z
  .object({
    jobId: objectIdSchema,
  })
  .strict();

export const JobAssignmentListingQuerySchema = z
  .object({
    status: z
      .enum(["assigned", "in_progress", "completed", "cancelled"])
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
