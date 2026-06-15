import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().optional(),
}).strict();

export const AdminUsersQuerySchema = PaginationQuerySchema.extend({
  role: z.enum(["worker", "employer", "admin"]).optional(),
  status: z.string().trim().optional(),
});

export const AdminUserIdParamsSchema = z.object({ id: objectId }).strict();

export const AdminUserUpdateSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(13).optional(),
  role: z.enum(["worker", "employer", "admin"]).optional(),
  is_active: z.boolean().optional(),
  bio: z.string().max(500).optional(),
  city: z.string().trim().optional(),
  skills: z.array(z.string()).optional(),
}).strict();

export const AdminWorkerModerationSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
  suspension_until: z.coerce.date().nullable().optional(),
}).strict();

export const AdminUserCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["worker", "employer", "admin"]),
  phone: z.string().max(13).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().trim().optional(),
  skills: z.array(z.string()).optional(),
}).strict();

export const AdminJobsQuerySchema = PaginationQuerySchema.extend({
  status: z.string().trim().optional(),
  category: z.string().trim().optional(),
});

export const AdminJobIdParamsSchema = z.object({ id: objectId }).strict();

export const AdminJobUpdateSchema = z.object({
  title: z.string().trim().max(150).optional(),
  description: z.string().trim().max(3000).optional(),
  category: z.string().trim().max(100).optional(),
  location: z.string().trim().max(250).optional(),
  status: z.enum(["open", "in_progress", "completed", "cancelled"]).optional(),
  salary: z.number().min(0).optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  duration: z.number().positive("Duration must be positive").optional(),
  required_workers: z.number().int().min(1).optional(),
}).strict();

export const AdminReportIdParamsSchema = z.object({ id: objectId }).strict();

export const AdminReportUpdateStatusSchema = z.object({
  status: z.enum(["open", "reviewed", "closed"]),
}).strict();

export const AdminReportReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  admin_notes: z.string().trim().max(1000).optional(),
}).strict();

export const AdminReportsQuerySchema = PaginationQuerySchema.extend({
  status: z.string().trim().optional(),
});

export const AdminWalletQuerySchema = PaginationQuerySchema.extend({
  type: z.string().trim().optional(),
});

export const AdminChatQuerySchema = PaginationQuerySchema.extend({
  status: z.string().trim().optional(),
});

export const AdminChatIdParamsSchema = z.object({ id: objectId }).strict();

export const AdminUserLogsQuerySchema = PaginationQuerySchema.extend({
  userId: objectId.optional(),
  targetType: z.string().trim().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
