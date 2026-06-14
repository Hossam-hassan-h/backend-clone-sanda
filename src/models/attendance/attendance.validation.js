import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

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
  })
  .strict();
