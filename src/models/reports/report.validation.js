import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

export const CreateReportSchema = z.object({
  reported_user: objectId,
  reason: z.string().trim().min(1, "Reason is required").max(1000),
  job: objectId.optional(),
}).strict();

export const ReportIdParamsSchema = z.object({ id: objectId }).strict();
