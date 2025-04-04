import type { NotificationType } from "@dust-tt/sparkle";
import { IconButton, SliderToggle } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import type { WhitelistableFeature, WorkspaceType } from "@app/types";

type FeatureFlagsDisplayType = {
  name: WhitelistableFeature;
  enabled: boolean;
};

export function makeColumnsForFeatureFlags(
  owner: WorkspaceType,
  reload: () => void,
  sendNotification: (n: NotificationType) => void
): ColumnDef<FeatureFlagsDisplayType>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Name</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      id: "enabled",
      cell: ({ row }) => {
        const { name, enabled } = row.original;

        return (
          <SliderToggle
            size="xs"
            selected={enabled}
            onClick={async () =>
              toggleFeatureFlag(owner, name, enabled, reload, sendNotification)
            }
          />
        );
      },
    },
  ];
}

async function toggleFeatureFlag(
  owner: WorkspaceType,
  feature: WhitelistableFeature,
  enabled: boolean,
  reload: () => void,
  sendNotification: (n: NotificationType) => void
) {
  try {
    const r = await fetch(`/api/poke/workspaces/${owner.sId}/features`, {
      method: enabled ? "DELETE" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: feature,
      }),
    });
    if (!r.ok) {
      const error: { error: { message: string } } = await r.json();
      throw new Error(error.error.message);
    }

    reload();
  } catch (e) {
    sendNotification({
      title: "Error",
      description: `An error occurred while toggling feature "${feature}": ${e}`,
      type: "error",
    });
  }
}
