import express from "express";
import verifyAccess from "../../middlewares/verifyAccess.js";
import { validate } from "../../middlewares/validate.js";
import {
  AssignmentConversationParamsSchema,
  ConversationIdParamsSchema,
  ConversationListingQuerySchema,
  MessageListingQuerySchema,
  SendMessageBodySchema,
} from "./conversation.validation.js";
import {
  createConversationForAssignment,
  getConversationById,
  getConversationMessages,
  getConversations,
  markConversationRead,
  sendMessage,
} from "./conversation.controller.js";

const conversationRoutes = express.Router();

conversationRoutes.post(
  "/job-assignments/:assignmentId/conversation",
  verifyAccess,
  validate(AssignmentConversationParamsSchema, "params"),
  createConversationForAssignment
);

conversationRoutes.get(
  "/conversations",
  verifyAccess,
  validate(ConversationListingQuerySchema, "query"),
  getConversations
);

conversationRoutes.get(
  "/conversations/:conversationId",
  verifyAccess,
  validate(ConversationIdParamsSchema, "params"),
  getConversationById
);

conversationRoutes.get(
  "/conversations/:conversationId/messages",
  verifyAccess,
  validate(ConversationIdParamsSchema, "params"),
  validate(MessageListingQuerySchema, "query"),
  getConversationMessages
);

conversationRoutes.post(
  "/conversations/:conversationId/messages",
  verifyAccess,
  validate(ConversationIdParamsSchema, "params"),
  validate(SendMessageBodySchema, "body"),
  sendMessage
);

conversationRoutes.patch(
  "/conversations/:conversationId/read",
  verifyAccess,
  validate(ConversationIdParamsSchema, "params"),
  markConversationRead
);

export default conversationRoutes;
