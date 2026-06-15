import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

const optionalObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID")
  .optional();

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
    qrToken: z.string().trim().min(1, "Attendance token is required"),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional()
      .nullable(),
  })
  .strict();

export const AttendanceReportQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    jobId: optionalObjectIdSchema,
    status: z.enum(["checked-in", "checked-out", "no-show", "all"]).optional(),
    workerName: z.string().max(100).optional(),
    fromDate: z.string().datetime({ offset: true }).optional(),
    toDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const AttendanceAnalyticsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    fromDate: z.string().datetime({ offset: true }).optional(),
    toDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
