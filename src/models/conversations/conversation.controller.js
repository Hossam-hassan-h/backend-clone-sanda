import * as conversationService from "./conversation.service.js";
import catchError from "../../utils/catchError.js";
import statusText from "../../utils/statusText.js";
import {
  emitConversationRead,
  emitMessageCreated,
} from "../../socket/emitters.js";

export const createConversationForAssignment = catchError(async (req, res) => {
  const { conversation, created } =
    await conversationService.createConversationForAssignment(
      req.params.assignmentId,
      req.user.userId
    );

  res.status(created ? 201 : 200).json({
    status: statusText.SUCCESS,
    data: conversation,
  });
});

export const getConversations = catchError(async (req, res) => {
  const { conversations, pagination } = await conversationService.getConversations(
    req.user.userId,
    req.query
  );

  res.json({
    status: statusText.SUCCESS,
    data: conversations,
    pagination,
  });
});

export const getConversationById = catchError(async (req, res) => {
  const conversation = await conversationService.getConversationById(
    req.params.conversationId,
    req.user.userId
  );

  res.json({
    status: statusText.SUCCESS,
    data: conversation,
  });
});

export const getConversationMessages = catchError(async (req, res) => {
  const { messages, pagination } =
    await conversationService.getConversationMessages(
      req.params.conversationId,
      req.user.userId,
      req.query
    );

  res.json({
    status: statusText.SUCCESS,
    data: messages,
    pagination,
  });
});

export const sendMessage = catchError(async (req, res) => {
  const { message, emit } = await conversationService.sendMessage(
    req.params.conversationId,
    req.user.userId,
    req.body.content
  );

  emitMessageCreated(emit);

  res.status(201).json({
    status: statusText.SUCCESS,
    data: message,
  });
});

export const markConversationRead = catchError(async (req, res) => {
  const { result, emit } = await conversationService.markConversationRead(
    req.params.conversationId,
    req.user.userId
  );

  emitConversationRead(emit);

  res.json({
    status: statusText.SUCCESS,
    data: result,
  });
});
