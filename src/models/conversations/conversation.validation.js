import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ID");

export const AssignmentConversationParamsSchema = z
  .object({
    assignmentId: objectIdSchema,
  })
  .strict();

export const ConversationIdParamsSchema = z
  .object({
    conversationId: objectIdSchema,
  })
  .strict();

export const ConversationListingQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const MessageListingQuerySchema = z
  .object({
    before: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const SendMessageBodySchema = z
  .object({
    content: z.string().trim().min(1).max(2000),
  })
  .strict();
