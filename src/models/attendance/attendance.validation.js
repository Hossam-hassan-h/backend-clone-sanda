import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

const dateStringSchema = z.string().datetime().optional();

export const AttendanceAssignmentIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const GenerateAttendanceTokenSchema = z
  .object({
    replace: z.boolean().optional(),
  })
  .strict();

export const ScanAttendanceTokenSchema = z
  .object({
    qrToken: z.string().trim().min(32, "Attendance token is required"),
    location: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AttendanceReportQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    jobId: objectIdSchema.optional(),
    status: z.enum(["assigned", "in_progress", "completed", "cancelled", "checked-in", "checked-out", "no-show"]).optional(),
    workerName: z.string().trim().max(100).optional(),
    fromDate: dateStringSchema,
    toDate: dateStringSchema,
  })
  .strict();

export const AttendanceAdminAnalyticsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    fromDate: dateStringSchema,
    toDate: dateStringSchema,
  })
  .strict();
