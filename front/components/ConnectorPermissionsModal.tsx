import type { NotificationType } from "@dust-tt/sparkle";
import {
  Avatar,
  Button,
  CloudArrowLeftRightIcon,
  ContentMessage,
  Dialog,
  Hoverable,
  Icon,
  Input,
  LockIcon,
  Modal,
  Page,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  APIError,
  BaseContentNode,
  ConnectorPermission,
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  LightWorkspaceType,
  UpdateConnectorRequestBody,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CONNECTOR_TYPE_TO_MISMATCH_ERROR,
  isOAuthProvider,
  isValidZendeskSubdomain,
  MANAGED_DS_DELETABLE,
} from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import type { ConfirmDataType } from "@app/components/Confirm";
import { ConfirmContext } from "@app/components/Confirm";
import { CreateOrUpdateConnectionSnowflakeModal } from "@app/components/data_source/CreateOrUpdateConnectionSnowflakeModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import { setupConnection } from "@app/components/spaces/AddConnectionMenu";
import { ConnectorDataUpdatedModal } from "@app/components/spaces/ConnectorDataUpdatedModal";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import { useSpaceDataSourceViews, useSystemSpace } from "@app/lib/swr/spaces";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

import type { ContentNodeTreeItemStatus } from "./ContentNodeTree";
import { ContentNodeTree } from "./ContentNodeTree";

const PERMISSIONS_EDITABLE_CONNECTOR_TYPES: Set<ConnectorProvider> = new Set([
  "confluence",
  "slack",
  "google_drive",
  "microsoft",
  "intercom",
  "snowflake",
  "zendesk",
]);

const CONNECTOR_TYPE_TO_PERMISSIONS: Record<
  ConnectorProvider,
  { selected: ConnectorPermission; unselected: ConnectorPermission } | undefined
> = {
  confluence: {
    selected: "read",
    unselected: "none",
  },
  slack: {
    selected: "read_write",
    unselected: "write",
  },
  google_drive: {
    selected: "read",
    unselected: "none",
  },
  microsoft: {
    selected: "read",
    unselected: "none",
  },
  notion: undefined,
  github: undefined,
  zendesk: {
    selected: "read",
    unselected: "none",
  },
  intercom: {
    selected: "read",
    unselected: "none",
  },
  webcrawler: undefined,
  snowflake: {
    selected: "read",
    unselected: "none",
  },
};

const getUseResourceHook =
  (owner: LightWorkspaceType, dataSource: DataSourceType) =>
  (parentId: string | null) =>
    useConnectorPermissions({
      dataSource,
      filterPermission: null,
      owner,
      parentId,
      viewType: "documents",
    });
interface DataSourceManagementModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

interface DataSourceEditionModalProps {
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
  onEditPermissionsClick: (extraConfig: Record<string, string>) => void;
  owner: LightWorkspaceType;
}

export async function handleUpdatePermissions(
  connector: ConnectorType,
  dataSource: DataSourceType,
  owner: LightWorkspaceType,
  extraConfig: Record<string, string>,
  sendNotification: (notification: NotificationType) => void
) {
  const provider = connector.type;

  const connectionIdRes = await setupConnection({
    owner,
    provider,
    extraConfig,
  });
  if (connectionIdRes.isErr()) {
    sendNotification({
      type: "error",
      title: "Failed to update the permissions of the Data Source",
      description: connectionIdRes.error.message,
    });
    return;
  }

  const updateRes = await updateConnectorConnectionId(
    connectionIdRes.value,
    provider,
    dataSource,
    owner
  );
  if (updateRes.error) {
    sendNotification({
      type: "error",
      title: "Failed to update the permissions of the Data Source",
      description: updateRes.error,
    });
  } else {
    sendNotification({
      type: "success",
      title: "Successfully updated connection",
      description: "The connection was successfully updated.",
    });
  }
}

async function updateConnectorConnectionId(
  newConnectionId: string,
  provider: string,
  dataSource: DataSourceType,
  owner: LightWorkspaceType
) {
  const res = await fetch(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId: newConnectionId,
      } satisfies UpdateConnectorRequestBody),
    }
  );

  if (res.ok) {
    return { success: true, error: null };
  }

  const jsonErr = await res.json();
  const error = jsonErr.error;

  if (error.type === "connector_oauth_target_mismatch") {
    return {
      success: false,
      error: CONNECTOR_TYPE_TO_MISMATCH_ERROR[provider as ConnectorProvider],
    };
  }
  return {
    success: false,
    error: `Failed to update the permissions of the Data Source: (contact support@dust.tt for assistance)`,
  };
}

function DataSourceManagementModal({
  children,
  isOpen,
  onClose,
}: DataSourceManagementModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Connection"
      variant="side-sm"
      hasChanged={false}
    >
      <Page variant="modal">{children}</Page>
    </Modal>
  );
}

function DataSourceEditionModal({
  dataSource,
  isOpen,
  onClose,
  onEditPermissionsClick,
  owner,
}: DataSourceEditionModalProps) {
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { user } = useUser();

  const { connectorProvider, editedByUser } = dataSource;

  const isExtraConfigValid = useCallback(
    (extraConfig: Record<string, string>) => {
      if (connectorProvider === "zendesk") {
        return isValidZendeskSubdomain(extraConfig.zendesk_subdomain);
      } else {
        return true;
      }
    },
    [connectorProvider]
  );

  useEffect(() => {
    if (isOpen) {
      setExtraConfig({});
    }
  }, [isOpen]);

  if (!connectorProvider || !user) {
    return null;
  }

  const isDataSourceOwner = editedByUser?.userId === user.sId;

  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connectorProvider];

  if (dataSource.connectorProvider === "snowflake") {
    return (
      <DataSourceManagementModal isOpen={isOpen} onClose={onClose}>
        Edit Snowflake
      </DataSourceManagementModal>
    );
  }

  return (
    <DataSourceManagementModal isOpen={isOpen} onClose={onClose}>
      <>
        <div className="mt-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Icon visual={connectorConfiguration.logoComponent} size="md" />
            <Page.SectionHeader
              title={`${connectorConfiguration.name} data & permissions`}
            />
          </div>
          {isDataSourceOwner && (
            <div className="mb-4 mt-8 w-full rounded-lg bg-amber-50 p-3">
              <div className="flex items-center gap-2 font-medium text-amber-800">
                <Icon visual={InformationCircleIcon} />
                Important
              </div>
              <div className="p-4 text-sm text-amber-900">
                <b>Editing</b> can break the existing data structure in Dust and
                Assistants using them.
              </div>

              {connectorConfiguration.guideLink && (
                <div className="pl-4 text-sm text-amber-800">
                  Read our{" "}
                  <a
                    href={connectorConfiguration.guideLink}
                    className="text-blue-600"
                    target="_blank"
                  >
                    Playbook
                  </a>
                  .
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pb-4 pt-4">
          <Page.SectionHeader title="Connection Owner" />
          <div className="flex items-center gap-2">
            <Avatar visual={editedByUser?.imageUrl} size="sm" />
            <div>
              <span className="font-bold">
                {isDataSourceOwner ? "You" : editedByUser?.fullName}
              </span>{" "}
              set it up
              {editedByUser?.editedAt
                ? ` on ${formatTimestampToFriendlyDate(editedByUser?.editedAt)}`
                : "."}
            </div>
          </div>
          {!isDataSourceOwner && (
            <div className="flex items-center justify-center gap-2">
              <RequestDataSourceModal
                dataSources={[dataSource]}
                owner={owner}
              />
            </div>
          )}
        </div>

        {!isDataSourceOwner && (
          <div className="item flex flex-col gap-2 border-t pt-4">
            <Page.SectionHeader title="Editing permissions" />
            <ContentMessage
              size="md"
              variant="pink"
              title="You are not the owner of this connection."
              icon={InformationCircleIcon}
            >
              Editing permission rights with a different account will likely
              break the existing data structure in Dust and Assistants using
              them.
              {connectorConfiguration.guideLink && (
                <div>
                  Read our{" "}
                  <Hoverable
                    href={connectorConfiguration.guideLink}
                    variant="primary"
                    target="_blank"
                  >
                    Playbook
                  </Hoverable>
                  .
                </div>
              )}
            </ContentMessage>
          </div>
        )}

        {connectorProvider === "zendesk" && (
          <div className="pb-4">
            <Input
              label="Zendesk account subdomain"
              message="The first part of your Zendesk account URL."
              messageStatus="info"
              name="subdomain"
              value={extraConfig.zendesk_subdomain ?? ""}
              placeholder="my-subdomain"
              onChange={(e) => {
                setExtraConfig({ zendesk_subdomain: e.target.value });
              }}
            />
          </div>
        )}

        <div className="flex items-center justify-center">
          <Button
            label="Edit Permissions"
            icon={LockIcon}
            variant="warning"
            disabled={!isExtraConfigValid(extraConfig)}
            onClick={() => {
              setShowConfirmDialog(true);
            }}
          />
        </div>

        <Dialog
          title="Are you sure?"
          isOpen={showConfirmDialog}
          onCancel={() => setShowConfirmDialog(false)}
          onValidate={() => {
            void onEditPermissionsClick(extraConfig);
            setShowConfirmDialog(false);
          }}
          validateVariant="warning"
          cancelLabel="Cancel"
          validateLabel="Continue"
        >
          The changes you are about to make may break existing{" "}
          {connectorConfiguration.name} Data sources and the assistants using
          them. Are you sure you want to continue?
        </Dialog>
      </>
    </DataSourceManagementModal>
  );
}

interface DataSourceDeletionModalProps {
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}
function DataSourceDeletionModal({
  dataSource,
  isOpen,
  onClose,
  owner,
}: DataSourceDeletionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const sendNotification = useSendNotification();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { user } = useUser();
  const { systemSpace } = useSystemSpace({
    workspaceId: owner.sId,
  });
  const { mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: systemSpace?.sId ?? "",
      disabled: true,
    });
  const { connectorProvider, editedByUser } = dataSource;

  if (!connectorProvider || !user || !systemSpace) {
    return null;
  }

  const isDataSourceOwner = editedByUser?.userId === user.sId;
  const connectorConfiguration = CONNECTOR_CONFIGURATIONS[connectorProvider];

  const handleDelete = async () => {
    setIsLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources/${dataSource.sId}`,
      {
        method: "DELETE",
      }
    );
    if (res.ok) {
      sendNotification({
        title: "Successfully deleted connection",
        type: "success",
        description: "The connection has been successfully deleted.",
      });
      await mutateSpaceDataSourceViews();
      onClose();
    } else {
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        title: "Error deleting connection",
        type: "error",
        description: err.error.message,
      });
    }
    setIsLoading(false);
  };

  return (
    <DataSourceManagementModal isOpen={isOpen} onClose={onClose}>
      <>
        <div className="mt-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Icon visual={connectorConfiguration.logoComponent} size="md" />
            <Page.SectionHeader
              title={`Deleting ${connectorConfiguration.name} connection`}
            />
          </div>
          <div className="mb-4 mt-8 w-full rounded-lg bg-amber-50 p-3">
            <div className="flex items-center gap-2 font-medium text-amber-800">
              <Icon visual={InformationCircleIcon} />
              Important
            </div>
            <div className="p-4 text-sm text-amber-900">
              <b>Deleting</b> will break Assistants using this data.
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t pb-4 pt-4">
          <Page.SectionHeader title="Connection Owner" />
          <div className="flex items-center gap-2">
            <Avatar visual={editedByUser?.imageUrl} size="sm" />
            <div>
              <span className="font-bold">
                {isDataSourceOwner ? "You" : editedByUser?.fullName}
              </span>{" "}
              set it up
              {editedByUser?.editedAt
                ? ` on ${formatTimestampToFriendlyDate(editedByUser?.editedAt)}`
                : "."}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <Button
            label="Delete Connection"
            icon={LockIcon}
            variant="warning"
            onClick={() => {
              setShowConfirmDialog(true);
            }}
          />
        </div>

        <Dialog
          title="Are you sure?"
          isOpen={showConfirmDialog}
          onCancel={() => setShowConfirmDialog(false)}
          onValidate={() => {
            void handleDelete();
            setShowConfirmDialog(false);
          }}
          validateVariant="warning"
          cancelLabel="Cancel"
          validateLabel="Continue"
          isSaving={isLoading}
        >
          The changes you are about to make will break existing assistants using{" "}
          {connectorConfiguration.name}. Are you sure you want to continue?
        </Dialog>
      </>
    </DataSourceManagementModal>
  );
}

interface ConnectorPermissionsModalProps {
  connector: ConnectorType;
  dataSource: DataSourceType;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  onManageButtonClick?: () => void;
  owner: WorkspaceType;
  readOnly: boolean;
}

export function ConnectorPermissionsModal({
  connector,
  dataSource,
  isAdmin,
  isOpen,
  onClose,
  onManageButtonClick,
  owner,
  readOnly,
}: ConnectorPermissionsModalProps) {
  const { mutate } = useSWRConfig();

  const confirm = useContext(ConfirmContext);
  const [selectedNodes, setSelectedNodes] = useState<
    Record<string, ContentNodeTreeItemStatus>
  >({});

  const canUpdatePermissions = PERMISSIONS_EDITABLE_CONNECTOR_TYPES.has(
    connector.type
  );
  const selectedPermission: ConnectorPermission =
    (dataSource.connectorProvider &&
      CONNECTOR_TYPE_TO_PERMISSIONS[dataSource.connectorProvider]?.selected) ||
    "none";
  const unselectedPermission: ConnectorPermission =
    (dataSource.connectorProvider &&
      CONNECTOR_TYPE_TO_PERMISSIONS[dataSource.connectorProvider]
        ?.unselected) ||
    "none";

  const useResourcesHook = useCallback(
    (parentId: string | null) =>
      getUseResourceHook(owner, dataSource)(parentId),
    [owner, dataSource]
  );

  const { resources: allSelectedResources, isResourcesLoading } =
    useConnectorPermissions({
      dataSource,
      filterPermission: "read",
      owner,
      parentId: null,
      viewType: "documents",
      includeParents: true,
      disabled: !canUpdatePermissions,
    });

  const initialTreeSelectionModel = useMemo(
    () =>
      allSelectedResources.reduce<Record<string, ContentNodeTreeItemStatus>>(
        (acc, r) => ({
          ...acc,
          [r.internalId]: {
            isSelected: true,
            node: r,
            parents: r.parentInternalIds || [],
          },
        }),
        {}
      ),
    [allSelectedResources]
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedNodes(initialTreeSelectionModel);
    }
  }, [initialTreeSelectionModel, isOpen]);

  const [modalToShow, setModalToShow] = useState<
    "data_updated" | "edition" | "selection" | "deletion" | null
  >(null);
  const { activeSubscription } = useWorkspaceActiveSubscription({
    workspaceId: owner.sId,
    disabled: !isAdmin,
  });
  const plan = activeSubscription ? activeSubscription.plan : null;

  const [saving, setSaving] = useState(false);
  const sendNotification = useSendNotification();
  const { user } = useUser();

  function closeModal(save: boolean) {
    setModalToShow(null);
    onClose(save);
    setTimeout(() => {
      setSelectedNodes({});
    }, 300);
  }

  async function save() {
    if (
      !(await confirmPrivateNodesSync({
        selectedNodes: Object.values(selectedNodes)
          .filter((sn) => sn.isSelected)
          .map((sn) => sn.node),
        confirm,
      }))
    ) {
      return;
    }
    setSaving(true);
    try {
      if (Object.keys(selectedNodes).length) {
        const r = await fetch(
          `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              resources: Object.keys(selectedNodes).map((internalId) => ({
                internal_id: internalId,
                permission: selectedNodes[internalId].isSelected
                  ? selectedPermission
                  : unselectedPermission,
              })),
            }),
          }
        );

        if (!r.ok) {
          const error: { error: { message: string } } = await r.json();
          window.alert(error.error.message);
        }
        void mutate(
          (key) =>
            typeof key === "string" &&
            key.startsWith(
              `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions`
            )
        );

        // Display the data updated modal.
        setModalToShow("data_updated");
      } else {
        closeModal(false);
      }
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Error saving permissions",
        description: "An unexpected error occurred while saving permissions.",
      });
      console.error(e);
    }
    setSaving(false);
  }

  const isUnchanged = useMemo(
    () =>
      Object.values(selectedNodes)
        .filter((item) => item.isSelected)
        .every(
          (item) =>
            item.isSelected ===
            initialTreeSelectionModel[item.node.internalId]?.isSelected
        ) &&
      Object.values(selectedNodes)
        .filter((item) => !item.isSelected)
        .every((item) => !initialTreeSelectionModel[item.node.internalId]),
    [selectedNodes, initialTreeSelectionModel]
  );

  useEffect(() => {
    if (isOpen) {
      setModalToShow("selection");
    } else {
      setModalToShow(null);
    }
  }, [connector.type, isOpen]);

  if (!user) {
    return;
  }

  const OptionsComponent =
    CONNECTOR_CONFIGURATIONS[connector.type].optionsComponent;

  return (
    <>
      {onManageButtonClick && (
        <Button
          size="sm"
          label={`Manage ${getDisplayNameForDataSource(dataSource)}`}
          icon={CloudArrowLeftRightIcon}
          variant="primary"
          disabled={readOnly || !isAdmin}
          onClick={() => {
            setModalToShow("selection");
            onManageButtonClick();
          }}
        />
      )}
      <Modal
        title={`Manage ${getDisplayNameForDataSource(dataSource)} connection`}
        isOpen={modalToShow === "selection"}
        onClose={() => closeModal(false)}
        onSave={save}
        saveLabel="Save"
        savingLabel="Saving..."
        isSaving={saving}
        hasChanged={!isUnchanged}
        className="flex"
        variant="side-md"
      >
        <div className="mx-auto mt-4 flex w-full max-w-4xl grow flex-col gap-4">
          <div className="flex flex-row justify-end gap-2">
            {(isOAuthProvider(connector.type) ||
              connector.type === "snowflake") && (
              <Button
                label={
                  connector.type !== "snowflake"
                    ? "Edit permissions"
                    : "Edit connection"
                }
                variant="outline"
                icon={LockIcon}
                onClick={() => {
                  setModalToShow("edition");
                }}
              />
            )}
            {MANAGED_DS_DELETABLE.includes(connector.type) && (
              <Button
                label="Delete connection"
                variant="warning"
                icon={TrashIcon}
                onClick={() => {
                  setModalToShow("deletion");
                }}
              />
            )}
          </div>
          {OptionsComponent && plan && (
            <>
              <div className="p-1 text-xl font-bold">Connector options</div>

              <div className="p-1">
                <div className="border-y">
                  <OptionsComponent
                    {...{ owner, readOnly, isAdmin, dataSource, plan }}
                  />
                </div>
              </div>
            </>
          )}

          <div className="p-1 text-xl font-bold">
            {CONNECTOR_CONFIGURATIONS[connector.type].selectLabel}
          </div>

          <ContentNodeTree
            isSearchEnabled={
              CONNECTOR_CONFIGURATIONS[connector.type].isSearchEnabled
            }
            isRoundedBackground={true}
            useResourcesHook={useResourcesHook}
            selectedNodes={canUpdatePermissions ? selectedNodes : undefined}
            setSelectedNodes={
              canUpdatePermissions && !isResourcesLoading
                ? setSelectedNodes
                : undefined
            }
            showExpand={CONNECTOR_CONFIGURATIONS[connector.type]?.isNested}
          />
        </div>
      </Modal>
      {/* Snowflake is not oauth-based and has its own config form */}
      {connector.type === "snowflake" ? (
        <CreateOrUpdateConnectionSnowflakeModal
          owner={owner}
          connectorProviderConfiguration={
            CONNECTOR_CONFIGURATIONS[connector.type]
          }
          isOpen={modalToShow === "edition"}
          onClose={() => closeModal(false)}
          dataSourceToUpdate={dataSource}
          onSuccess={() => {
            setModalToShow("selection");
          }}
        />
      ) : (
        <DataSourceEditionModal
          isOpen={modalToShow === "edition"}
          onClose={() => closeModal(false)}
          dataSource={dataSource}
          owner={owner}
          onEditPermissionsClick={async (
            extraConfig: Record<string, string>
          ) => {
            await handleUpdatePermissions(
              connector,
              dataSource,
              owner,
              extraConfig,
              sendNotification
            );
            closeModal(false);
          }}
        />
      )}

      <DataSourceDeletionModal
        isOpen={modalToShow === "deletion"}
        onClose={() => closeModal(false)}
        dataSource={dataSource}
        owner={owner}
      />
      <ConnectorDataUpdatedModal
        owner={owner}
        isOpen={modalToShow === "data_updated"}
        onClose={() => {
          closeModal(false);
        }}
        connectorProvider={connector.type}
      />
    </>
  );
}

export async function confirmPrivateNodesSync({
  selectedNodes,
  confirm,
}: {
  selectedNodes: BaseContentNode[];
  confirm: (n: ConfirmDataType) => Promise<boolean>;
}): Promise<boolean> {
  // confirmation in case there are private nodes
  const privateNodes = selectedNodes.filter(
    (node) => node.providerVisibility === "private"
  );

  if (privateNodes.length > 0) {
    const warnNodes = privateNodes.slice(0, 3).map((node) => node.title);
    if (privateNodes.length > 3) {
      warnNodes.push(` and ${privateNodes.length - 3} more...`);
    }

    return confirm({
      title: "Sensitive data synchronization",
      message: `You are synchronizing data from private source(s): ${warnNodes.join(", ")}. Is this okay?`,
      validateVariant: "warning",
    });
  }
  return true;
}
