import type { DocumentType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDocumentsResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);

  const { wId, name } = req.query;
  if (typeof wId !== "string" || typeof name !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The request query parameters are invalid.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const dataSource = await getDataSource(auth, name);

  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const documents = await coreAPI.getDataSourceDocuments(
        {
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
        },
        {
          limit,
          offset,
        }
      );

      if (documents.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "internal_server_error",
            message:
              "We encountered an error while fetching the data source documents.",
            data_source_error: documents.error,
          },
        });
      }

      res.status(200).json({
        documents: documents.value.documents,
        total: documents.value.total,
      });
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

export default withSessionAuthentication(handler);
