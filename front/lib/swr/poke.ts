import type {
  ConnectorPermission,
  DataSourceType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import type { RegionType } from "@app/lib/api/regions/config";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokePlansResponseBody } from "@app/pages/api/poke/plans";
import type { GetRegionResponseType } from "@app/pages/api/poke/region";
import type { GetPokeWorkspacesResponseBody } from "@app/pages/api/poke/workspaces";
import type { GetPokeFeaturesResponseBody } from "@app/pages/api/poke/workspaces/[wId]/features";
import type { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/permissions";

export function usePokeRegion() {
  const regionFetcher: Fetcher<GetRegionResponseType> = fetcher;

  const { data, error } = useSWRWithDefaults("/api/poke/region", regionFetcher);

  return {
    region: useMemo(
      () => (data?.region ? (data.region as RegionType) : undefined),
      [data]
    ),
    isRegionLoading: !error && !data,
    isRegionError: error,
  };
}

export function usePokeConnectorPermissions({
  owner,
  dataSource,
  parentId,
  filterPermission,
  disabled,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  filterPermission: ConnectorPermission | null;
  disabled?: boolean;
}) {
  const permissionsFetcher: Fetcher<GetDataSourcePermissionsResponseBody> =
    fetcher;

  let url = `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions?viewType=documents`;
  if (parentId) {
    url += `&parentId=${parentId}`;
  }
  if (filterPermission) {
    url += `&filterPermission=${filterPermission}`;
  }

  const { data, error } = useSWRWithDefaults(url, permissionsFetcher, {
    disabled,
  });

  return {
    resources: useMemo(() => (data ? data.resources : []), [data]),
    isResourcesLoading: !error && !data,
    isResourcesError: error,
  };
}

export function usePokeWorkspaces({
  upgraded,
  search,
  disabled,
  limit,
}: {
  upgraded?: boolean;
  search?: string;
  disabled?: boolean;
  limit?: number;
} = {}) {
  const workspacesFetcher: Fetcher<GetPokeWorkspacesResponseBody> = fetcher;

  const queryParams = [
    upgraded !== undefined ? `upgraded=${upgraded}` : null,
    search ? `search=${search}` : null,
    limit ? `limit=${limit}` : null,
  ].filter((q) => q);

  let query = "";
  if (queryParams.length > 0) {
    query = `?${queryParams.join("&")}`;
  }

  const { data, error } = useSWRWithDefaults(
    `api/poke/workspaces${query}`,
    workspacesFetcher,
    {
      disabled,
    }
  );

  return {
    workspaces: useMemo(() => (data ? data.workspaces : []), [data]),
    isWorkspacesLoading: !error && !data,
    isWorkspacesError: error,
  };
}

export function usePokePlans() {
  const plansFetcher: Fetcher<GetPokePlansResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults("/api/poke/plans", plansFetcher);

  return {
    plans: useMemo(() => (data ? data.plans : []), [data]),
    isPlansLoading: !error && !data,
    isPlansError: error,
  };
}

export function usePokeFeatureFlags({ workspaceId }: { workspaceId: string }) {
  const featureFlagsFetcher: Fetcher<GetPokeFeaturesResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/poke/workspaces/${workspaceId}/features`,
    featureFlagsFetcher
  );

  return {
    featureFlags: useMemo(() => (data ? data.features : []), [data]),
    isFeatureFlagsLoading: !error && !data,
    isFeatureFlagsError: error,
  };
}
