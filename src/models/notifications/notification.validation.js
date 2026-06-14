import { z } from "zod";
import { NOTIFICATION_TYPES } from "./notification.model.js";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export const NotificationIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const NotificationListingQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    is_read: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    type: NotificationTypeSchema.optional(),
  })
  .strict();
