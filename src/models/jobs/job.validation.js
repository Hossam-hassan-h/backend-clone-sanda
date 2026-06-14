import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

const jobFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(150, "Title cannot exceed 150 characters"),

  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(3000, "Description cannot exceed 3000 characters"),

  category: z
    .string()
    .trim()
    .max(100, "Category cannot exceed 100 characters")
    .optional(),

  location: z
    .string()
    .trim()
    .min(1, "Location is required")
    .max(250, "Location cannot exceed 250 characters"),

  start_date: z.coerce.date(),

  end_date: z.coerce.date().optional(),

  duration: z.number().positive("Duration must be positive").optional(),

  salary: z.number().min(0, "Salary cannot be negative"),

  required_workers: z
    .number()
    .int("Required workers must be an integer")
    .min(1, "Required workers must be at least 1"),
});

export const CreateJobSchema = jobFieldsSchema.strict().refine(
  (data) => !data.end_date || data.end_date >= data.start_date,
  {
    message: "End date cannot be earlier than start date",
    path: ["end_date"],
  }
);

export const UpdateJobSchema = jobFieldsSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Update body cannot be empty",
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    {
      message: "End date cannot be earlier than start date",
      path: ["end_date"],
    }
  );

export const JobIdParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const JobListingQuerySchema = z
  .object({
    status: z.enum(["open", "in_progress", "completed", "cancelled"]).optional(),
    category: z
      .string()
      .trim()
      .max(100, "Category cannot exceed 100 characters")
      .optional(),
    location: z
      .string()
      .trim()
      .max(250, "Location cannot exceed 250 characters")
      .optional(),
    q: z
      .string()
      .trim()
      .max(150, "Search cannot exceed 150 characters")
      .optional(),
    search: z
      .string()
      .trim()
      .max(150, "Search cannot exceed 150 characters")
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
