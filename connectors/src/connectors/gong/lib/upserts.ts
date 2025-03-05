import { MIME_TYPES } from "@dust-tt/types";

import type {
  GongCallTranscript,
  GongTranscriptMetadata,
} from "@connectors/connectors/gong/lib/gong_api";
import {
  makeGongTranscriptFolderInternalId,
  makeGongTranscriptInternalId,
} from "@connectors/connectors/gong/lib/internal_ids";
import {
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GongUserResource } from "@connectors/resources/gong_resources";
import { GongTranscriptResource } from "@connectors/resources/gong_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * Syncs a transcript in the db and upserts it to the data sources.
 */
export async function syncGongTranscript({
  transcript,
  transcriptMetadata,
  participants,
  speakerToEmailMap,
  connector,
  dataSourceConfig,
  loggerArgs,
  forceResync,
}: {
  transcript: GongCallTranscript;
  transcriptMetadata: GongTranscriptMetadata;
  participants: GongUserResource[];
  speakerToEmailMap: Record<string, string>;
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number | null>;
  forceResync: boolean;
}) {
  const { callId } = transcript;
  const createdAtDate = new Date(transcriptMetadata.metaData.started);
  const title = transcriptMetadata.metaData.title || "Untitled transcript";
  const documentUrl = transcriptMetadata.metaData.url;

  const transcriptInDb = await GongTranscriptResource.fetchByCallId(
    callId,
    connector
  );

  if (!forceResync && transcriptInDb) {
    logger.info(
      {
        ...loggerArgs,
        callId,
      },
      "[Gong] Transcript already up to date, skipping sync."
    );
    return;
  }

  if (!transcriptInDb) {
    await GongTranscriptResource.makeNew({
      blob: {
        connectorId: connector.id,
        callId,
        title,
        url: documentUrl,
      },
    });
  }

  logger.info(
    {
      ...loggerArgs,
      callId,
      createdAtDate,
    },
    "[Gong] Upserting transcript."
  );

  const hours = Math.floor(transcriptMetadata.metaData.duration / 3600);
  const minutes = Math.floor(
    (transcriptMetadata.metaData.duration % 3600) / 60
  );
  const callDuration = `${hours} hours ${minutes < 10 ? "0" + minutes : minutes} minutes`;

  let markdownContent = `Meeting title: ${title}\n\nDate: ${createdAtDate.toISOString()}\n\nDuration: ${callDuration}\n\n`;

  // Rebuild the transcript content with [User]: [sentence].
  transcript.transcript.forEach((monologue) => {
    let lastSpeakerId: string | null = null;
    monologue.sentences.forEach((sentence) => {
      if (monologue.speakerId !== lastSpeakerId) {
        markdownContent += `# ${speakerToEmailMap[monologue.speakerId] || "Unknown speaker"}\n`;
        lastSpeakerId = monologue.speakerId;
      }
      markdownContent += `${sentence.text}\n`;
    });
  });

  const renderedContent = await renderMarkdownSection(
    dataSourceConfig,
    markdownContent
  );
  const documentContent = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title,
    content: renderedContent,
    createdAt: createdAtDate,
    additionalPrefixes: {
      language: transcriptMetadata.metaData.language,
      media: transcriptMetadata.metaData.media,
      scope: transcriptMetadata.metaData.scope,
      direction: transcriptMetadata.metaData.direction,
      participants: participants.map((p) => p.email).join(", ") || "none",
    },
  });

  const documentId = makeGongTranscriptInternalId(connector, callId);

  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent,
    documentUrl,
    timestampMs: createdAtDate.getTime(),
    tags: [
      `title:${title}`,
      `createdAt:${createdAtDate.getTime()}`,
      `language:${transcriptMetadata.metaData.language}`, // The language codes (as defined by ISO-639-2B): eng, fre, spa, ger, and ita.
      `media:${transcriptMetadata.metaData.media}`,
      `scope:${transcriptMetadata.metaData.scope}`,
      `direction:${transcriptMetadata.metaData.direction}`,
      ...participants.map((p) => p.email),
    ],
    parents: [documentId, makeGongTranscriptFolderInternalId(connector)],
    parentId: makeGongTranscriptFolderInternalId(connector),
    loggerArgs: { ...loggerArgs, callId },
    upsertContext: { sync_type: "batch" },
    title,
    mimeType: MIME_TYPES.GONG.TRANSCRIPT,
    async: true,
  });
}
