import type { LoggerInterface, Result } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";

import type { OAuthConnectionType, OAuthProvider } from "../../oauth/lib";
import type { OAuthAPIError } from "../../oauth/oauth_api";
import { OAuthAPI } from "../../oauth/oauth_api";

const OAUTH_ACCESS_TOKEN_CACHE_TTL = 1000 * 60 * 5;

const CACHE = new Map<
  string,
  {
    connection: OAuthConnectionType;
    access_token: string;
    access_token_expiry: number | null;
    scrubbed_raw_json: unknown;
    local_expiry: number;
  }
>();

export async function getOAuthConnectionAccessToken({
  config,
  logger,
  provider,
  connectionId,
}: {
  config: { url: string; apiKey: string | null };
  logger: LoggerInterface;
  provider: OAuthProvider;
  connectionId: string;
}): Promise<
  Result<
    {
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number | null;
      scrubbed_raw_json: unknown;
    },
    OAuthAPIError
  >
> {
  const cached = CACHE.get(connectionId);

  if (cached && cached.local_expiry > Date.now()) {
    return new Ok(cached);
  }

  const res = await new OAuthAPI(config, logger).getAccessToken({
    provider,
    connectionId,
  });

  if (res.isErr()) {
    return res;
  }

  CACHE.set(connectionId, {
    local_expiry: Date.now() + OAUTH_ACCESS_TOKEN_CACHE_TTL,
    ...res.value,
  });

  return res;
}
