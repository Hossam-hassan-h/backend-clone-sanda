import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

export const CreateRatingSchema = z
  .object({
    reviewed_user: objectIdSchema,
    stars: z
      .number()
      .int("Stars must be an integer")
      .min(1, "Stars must be at least 1")
      .max(5, "Stars cannot exceed 5"),
    comment: z
      .string()
      .trim()
      .max(1000, "Comment cannot exceed 1000 characters")
      .optional(),
  })
  .strict();

export const RatingIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const JobIdParamsSchema = z
  .object({
    jobId: objectIdSchema,
  })
  .strict();

export const UserIdParamsSchema = z
  .object({
    userId: objectIdSchema,
  })
  .strict();

export const RatingListingQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
