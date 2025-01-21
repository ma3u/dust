import type { GetFeedbacksResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation/without_content";
import { getConversationFeedbacksForUser } from "@app/lib/api/assistant/feedback";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/feedbacks:
 *   get:
 *     summary: Get feedbacks for a conversation
 *     description: |
 *       Retrieves all feedback entries for a specific conversation.
 *       Requires authentication and read:conversation scope.
 *     tags:
 *       - assistant
 *     parameters:
 *       - name: wId
 *         in: path
 *         description: Workspace ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: cId
 *         in: path
 *         description: Conversation ID
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of feedback entries for the conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedbacks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       messageId:
 *                         type: string
 *                         description: ID of the message that received feedback
 *                       agentMessageId:
 *                         type: number
 *                         description: ID of the agent message
 *                       userId:
 *                         type: number
 *                         description: ID of the user who gave feedback
 *                       thumbDirection:
 *                         type: string
 *                         enum: [up, down]
 *                         description: Direction of the thumb feedback
 *                       content:
 *                         type: string
 *                         nullable: true
 *                         description: Optional feedback content/comment
 *                       createdAt:
 *                         type: number
 *                         description: Timestamp when feedback was created
 *                       agentConfigurationId:
 *                         type: string
 *                         description: ID of the agent configuration
 *                       agentConfigurationVersion:
 *                         type: number
 *                         description: Version of the agent configuration
 *                       isConversationShared:
 *                         type: boolean
 *                         description: Whether the conversation was shared
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetFeedbacksResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversationRes = await getConversationWithoutContent(
    auth,
    conversationId
  );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "GET":
      const feedbacksRes = await getConversationFeedbacksForUser(
        auth,
        conversation
      );

      if (feedbacksRes.isErr()) {
        return apiErrorForConversation(req, res, feedbacksRes.error);
      }

      const feedbacks = feedbacksRes.value.map((feedback) => ({
        messageId: feedback.messageId,
        agentMessageId: feedback.agentMessageId,
        userId: feedback.userId,
        thumbDirection: feedback.thumbDirection,
        content: feedback.content,
        createdAt: feedback.createdAt.getTime(),
        agentConfigurationId: feedback.agentConfigurationId,
        agentConfigurationVersion: feedback.agentConfigurationVersion,
        isConversationShared: feedback.isConversationShared,
      }));

      res.status(200).json({ feedbacks });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { GET: "read:conversation" },
});
