import {
  parseNotificationEventKey,
  parseProviderKey,
  type AppendActivityEventInput,
  type CurrentWorkspace,
  type EncryptedCredentialEnvelope,
  type NotificationChannel,
  type NotificationChannelSource,
  type NotificationPreference,
  type ProviderKey,
} from "@context-layer/db";

import { HttpError } from "../../errors";
import {
  NotificationChannelAdapterError,
  type NotificationChannelAdapter,
} from "../../integrations/notification-channel-adapter";
import type { ProviderRegistry } from "../../integrations/provider-registry";
import { resolveProviderEventPreference } from "../../integrations/provider-registry";
import type { CredentialEncryption } from "../../security/credential-encryption";
import type {
  NotificationChannelContract,
  NotificationPreferenceContract,
} from "./notification.contracts";

interface NotificationRepository {
  appendActivity(input: AppendActivityEventInput): Promise<unknown>;
  clearPreferenceOverride(
    workspaceId: string,
    membershipId: string,
    eventKey: string,
  ): Promise<boolean>;
  createChannel(input: {
    channelId: string;
    configuration: Record<string, never>;
    createdByMembershipId: string;
    credentialEnvelope: EncryptedCredentialEnvelope;
    name: string;
    provider: ProviderKey;
    status: "connected";
    workspaceId: string;
  }): Promise<NotificationChannel>;
  deleteChannel(
    workspaceId: string,
    channelId: string,
    membershipId: string,
  ): Promise<boolean>;
  findChannel(
    workspaceId: string,
    channelId: string,
  ): Promise<NotificationChannel | null>;
  findCurrentWorkspace(userId: string): Promise<CurrentWorkspace | null>;
  listChannels(
    workspaceId: string,
    membershipId: string,
  ): Promise<NotificationChannel[]>;
  listChannelSources(
    workspaceId: string,
    channelId: string,
  ): Promise<NotificationChannelSource[]>;
  listPreferenceOverrides(
    workspaceId: string,
    membershipId: string,
  ): Promise<NotificationPreference[]>;
  replaceChannelSources(
    workspaceId: string,
    channelId: string,
    ownerMembershipId: string,
    providers: readonly ProviderKey[],
  ): Promise<NotificationChannelSource[]>;
  setPreferenceOverride(
    workspaceId: string,
    membershipId: string,
    eventKey: string,
    enabled: boolean,
  ): Promise<NotificationPreference>;
  updateChannel(input: {
    channelId: string;
    configuration: Record<string, never>;
    credentialEnvelope: EncryptedCredentialEnvelope;
    name: string;
    ownerMembershipId: string;
    status: "connected";
    workspaceId: string;
  }): Promise<NotificationChannel>;
}

export interface NotificationServiceDependencies {
  adapters: ReadonlyMap<string, NotificationChannelAdapter>;
  credentialEncryption: CredentialEncryption;
  providerRegistry: ProviderRegistry;
  repository: NotificationRepository;
}

function toChannelContract(
  channel: NotificationChannel,
  sourceProviders: readonly string[],
): NotificationChannelContract {
  return {
    id: channel.id,
    lastErrorCode: channel.lastErrorCode,
    lastValidatedAt: channel.lastValidatedAt?.toISOString() ?? null,
    name: channel.name,
    provider: channel.provider,
    sourceProviders,
    status: channel.status,
  };
}

async function requireWorkspace(
  repository: NotificationRepository,
  userId: string,
): Promise<CurrentWorkspace> {
  const workspace = await repository.findCurrentWorkspace(userId);

  if (workspace === null) {
    throw new HttpError(404, "WORKSPACE_NOT_FOUND", "No workspace was found.");
  }

  return workspace;
}

function requireAdapter(
  adapters: ReadonlyMap<string, NotificationChannelAdapter>,
  provider: string,
): NotificationChannelAdapter {
  const adapter = adapters.get(provider);

  if (adapter === undefined) {
    throw new HttpError(
      404,
      "PROVIDER_NOT_FOUND",
      `Unknown notification provider: ${provider}`,
    );
  }

  return adapter;
}

function mapAdapterError(error: unknown): never {
  if (error instanceof NotificationChannelAdapterError) {
    if (error.code === "invalid_webhook_url") {
      throw new HttpError(400, "INVALID_REQUEST", error.message);
    }

    throw new HttpError(502, "PROVIDER_UNAVAILABLE", error.message);
  }

  throw error;
}

export function createNotificationService({
  adapters,
  credentialEncryption,
  providerRegistry,
  repository,
}: NotificationServiceDependencies) {
  return {
    async createChannel(
      userId: string,
      provider: string,
      name: string,
      webhookUrl: string,
      correlationId: string,
    ): Promise<NotificationChannelContract> {
      const workspace = await requireWorkspace(repository, userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the workspace owner can manage notification channels.",
        );
      }

      const providerKey = parseProviderKey(provider);
      providerRegistry.require(providerKey);
      const adapter = requireAdapter(adapters, provider);

      try {
        adapter.validateConfiguration(webhookUrl);
        await adapter.send(
          { webhookUrl },
          {
            summary: `Context Layer is now connected to "${name}".`,
            title: "Connected",
          },
        );
      } catch (error) {
        mapAdapterError(error);
      }

      const channelId = crypto.randomUUID();
      const credentialEnvelope = credentialEncryption.encrypt(
        { webhookUrl },
        "notification-channel",
        channelId,
      );

      const channel = await repository.createChannel({
        channelId,
        configuration: {},
        createdByMembershipId: workspace.membership.id,
        credentialEnvelope,
        name,
        provider: providerKey,
        status: "connected",
        workspaceId: workspace.workspace.id,
      });

      await repository.appendActivity({
        actorMembershipId: workspace.membership.id,
        category: "notification",
        correlationId,
        operation: "notification_channel.created",
        provider: providerKey,
        status: "succeeded",
        summary: `Connected notification channel "${channel.name}".`,
        workspaceId: workspace.workspace.id,
      });

      return toChannelContract(channel, []);
    },

    async deleteChannel(
      userId: string,
      channelId: string,
      correlationId: string,
    ): Promise<void> {
      const workspace = await requireWorkspace(repository, userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the workspace owner can manage notification channels.",
        );
      }

      const channel = await repository.findChannel(
        workspace.workspace.id,
        channelId,
      );

      if (channel === null) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Notification channel not found.",
        );
      }

      const deleted = await repository.deleteChannel(
        workspace.workspace.id,
        channelId,
        workspace.membership.id,
      );

      if (!deleted) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Notification channel not found.",
        );
      }

      await repository.appendActivity({
        actorMembershipId: workspace.membership.id,
        category: "notification",
        correlationId,
        operation: "notification_channel.deleted",
        provider: parseProviderKey(channel.provider),
        status: "succeeded",
        summary: `Removed notification channel "${channel.name}".`,
        workspaceId: workspace.workspace.id,
      });
    },

    async list(userId: string): Promise<NotificationChannelContract[]> {
      const workspace = await requireWorkspace(repository, userId);
      const channels = await repository.listChannels(
        workspace.workspace.id,
        workspace.membership.id,
      );

      return Promise.all(
        channels.map(async (channel) => {
          const sources = await repository.listChannelSources(
            workspace.workspace.id,
            channel.id,
          );
          return toChannelContract(
            channel,
            sources.map((source) => source.provider),
          );
        }),
      );
    },

    async listPreferences(
      userId: string,
    ): Promise<NotificationPreferenceContract[]> {
      const workspace = await requireWorkspace(repository, userId);
      const overrides = await repository.listPreferenceOverrides(
        workspace.workspace.id,
        workspace.membership.id,
      );
      const overrideByKey = new Map(
        overrides.map((override) => [override.eventKey, override]),
      );
      const events = providerRegistry
        .list()
        .flatMap((definition) => definition.notificationEvents);

      return events.map((event) => ({
        defaultEnabled: event.defaultEnabled,
        displayName: event.displayName,
        enabled: resolveProviderEventPreference(
          event,
          overrideByKey.get(event.key),
        ),
        eventKey: event.key,
      }));
    },

    async setPreference(
      userId: string,
      eventKeyInput: string,
      enabled: boolean,
    ): Promise<NotificationPreferenceContract> {
      const workspace = await requireWorkspace(repository, userId);
      const eventKey = parseNotificationEventKey(eventKeyInput);
      const definition = providerRegistry.getNotificationEvent(eventKey);

      if (definition === undefined) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          `Unknown notification event: ${eventKeyInput}`,
        );
      }

      if (enabled === definition.defaultEnabled) {
        await repository.clearPreferenceOverride(
          workspace.workspace.id,
          workspace.membership.id,
          eventKey,
        );

        return {
          defaultEnabled: definition.defaultEnabled,
          displayName: definition.displayName,
          enabled: definition.defaultEnabled,
          eventKey: definition.key,
        };
      }

      const override = await repository.setPreferenceOverride(
        workspace.workspace.id,
        workspace.membership.id,
        eventKey,
        enabled,
      );

      return {
        defaultEnabled: definition.defaultEnabled,
        displayName: definition.displayName,
        enabled: override.enabled,
        eventKey: definition.key,
      };
    },

    async testChannel(userId: string, channelId: string): Promise<void> {
      const workspace = await requireWorkspace(repository, userId);
      const channel = await repository.findChannel(
        workspace.workspace.id,
        channelId,
      );

      if (channel === null) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Notification channel not found.",
        );
      }

      if (channel.credentialEnvelope === null) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Notification channel not found.",
        );
      }

      const adapter = requireAdapter(adapters, channel.provider);
      const credentials = credentialEncryption.decrypt(
        channel.credentialEnvelope,
        "notification-channel",
        channel.id,
      ) as { webhookUrl: string };

      try {
        await adapter.send(credentials, {
          summary: `This is a test notification for "${channel.name}".`,
          title: "Test notification",
        });
      } catch (error) {
        mapAdapterError(error);
      }
    },

    async updateChannel(
      userId: string,
      channelId: string,
      name: string,
      webhookUrl: string,
      correlationId: string,
    ): Promise<NotificationChannelContract> {
      const workspace = await requireWorkspace(repository, userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the workspace owner can manage notification channels.",
        );
      }

      const existing = await repository.findChannel(
        workspace.workspace.id,
        channelId,
      );

      if (existing === null) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Notification channel not found.",
        );
      }

      const adapter = requireAdapter(adapters, existing.provider);

      try {
        adapter.validateConfiguration(webhookUrl);
        await adapter.send(
          { webhookUrl },
          {
            summary: `Context Layer is now connected to "${name}".`,
            title: "Connected",
          },
        );
      } catch (error) {
        mapAdapterError(error);
      }

      const credentialEnvelope = credentialEncryption.encrypt(
        { webhookUrl },
        "notification-channel",
        channelId,
      );

      const channel = await repository.updateChannel({
        channelId,
        configuration: {},
        credentialEnvelope,
        name,
        ownerMembershipId: workspace.membership.id,
        status: "connected",
        workspaceId: workspace.workspace.id,
      });

      await repository.appendActivity({
        actorMembershipId: workspace.membership.id,
        category: "notification",
        correlationId,
        operation: "notification_channel.updated",
        provider: parseProviderKey(channel.provider),
        status: "succeeded",
        summary: `Updated notification channel "${channel.name}".`,
        workspaceId: workspace.workspace.id,
      });

      const sources = await repository.listChannelSources(
        workspace.workspace.id,
        channel.id,
      );

      return toChannelContract(
        channel,
        sources.map((source) => source.provider),
      );
    },

    async setChannelSources(
      userId: string,
      channelId: string,
      providersInput: readonly string[],
    ): Promise<NotificationChannelContract> {
      const workspace = await requireWorkspace(repository, userId);

      if (workspace.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the workspace owner can manage notification channels.",
        );
      }

      const channel = await repository.findChannel(
        workspace.workspace.id,
        channelId,
      );

      if (channel === null) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Notification channel not found.",
        );
      }

      const providers = providersInput.map((provider) => {
        const providerKey = parseProviderKey(provider);
        providerRegistry.require(providerKey);
        return providerKey;
      });

      const sources = await repository.replaceChannelSources(
        workspace.workspace.id,
        channelId,
        workspace.membership.id,
        providers,
      );

      return toChannelContract(
        channel,
        sources.map((source) => source.provider),
      );
    },
  };
}
