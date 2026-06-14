import { z } from "zod";

const UserRoleEnum = z.enum(["admin", "employer", "worker"]);

const ProfileImageSchema = z.object({
  url: z.string().nullable().optional().default(null),
  publicId: z.string().nullable().optional().default(null),
});

export const userValidationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name cannot exceed 100 characters"),

  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email format")
    .transform((email) => email.toLowerCase()),

  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),

  role: UserRoleEnum.optional().default("employer"),

  profile_image: ProfileImageSchema.optional(),

  phone: z
    .string()
    .max(13, "Phone cannot exceed 13 characters")
    .optional()
    .default(""),

  bio: z
    .string()
    .max(500, "Bio cannot exceed 500 characters")
    .optional()
    .default(""),

  city: z.string().max(200).optional().default(""),

  skills: z.array(z.string()).optional().default([]),

  is_active: z
    .boolean()
    .optional()
    .default(true),
});

export const updateProfileSchema = userValidationSchema
  .omit({
    email: true,
    password: true,
    role: true,
    is_active: true,
  })
  .partial()
  .strict();

export default userValidationSchema;
