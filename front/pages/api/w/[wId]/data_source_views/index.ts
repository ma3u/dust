import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { DataSourceViewType, WithAPIErrorResponse } from "@app/types";

export type GetDataSourceViewsResponseBody = {
  dataSourceViews: DataSourceViewType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);

  switch (req.method) {
    case "GET":
      res
        .status(200)
        .json({ dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()) });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
