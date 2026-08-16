export interface NotificationHealthInput {
  lastErrorCode: string | null;
  lastValidatedAt: string | null;
  status: "connected" | "disconnected" | "error";
}

export interface NotificationHealthView {
  message: string;
  tone: "healthy" | "warning";
}

function formatCheckedAt(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function notificationChannelHealth(
  channel: NotificationHealthInput,
): NotificationHealthView {
  const messages: Record<string, string> = {
    adapter_unavailable:
      "This destination is not configured on the server. Ask an administrator to enable it, then test again.",
    credentials_unavailable:
      "The stored webhook credentials can no longer be read. Replace the webhook URL, then test again.",
    invalid_response:
      "Teams rejected this webhook. Replace or reauthorize it, then test again.",
    invalid_webhook_url:
      "The webhook URL is invalid. Replace it with a current HTTPS workflow URL, then test again.",
    temporarily_unavailable:
      "Teams could not be reached. Wait a few minutes, then send another test message.",
  };

  if (channel.lastErrorCode === null && channel.status === "connected") {
    return {
      message:
        channel.lastValidatedAt === null
          ? "Connected"
          : `Connected · Last checked ${formatCheckedAt(channel.lastValidatedAt)}`,
      tone: "healthy",
    };
  }

  const guidance =
    channel.lastErrorCode === null
      ? "This channel is not connected. Update its webhook URL, then test again."
      : (messages[channel.lastErrorCode] ??
        "This channel needs attention. Update its webhook URL, then test again.");
  return {
    message:
      channel.lastValidatedAt === null
        ? guidance
        : `${guidance} Last checked ${formatCheckedAt(channel.lastValidatedAt)}.`,
    tone: "warning",
  };
}

export interface NotificationSetupWarning {
  message: string;
  title: string;
}

export function notificationSetupWarnings(input: {
  channelErrorMessage: string | null;
  channelsAvailable: boolean;
  enabledEventCount: number;
  eventCount: number;
  hasScopes: boolean;
  hasSubscribedConnectedChannel: boolean;
  providerDisplayName: string;
  scopeLabel: string;
  selectedScopeCount: number;
}): NotificationSetupWarning[] {
  const warnings: NotificationSetupWarning[] = [];

  if (input.hasScopes && input.selectedScopeCount === 0) {
    warnings.push({
      message: `No ${input.scopeLabel} are allowed, so incoming ${input.providerDisplayName} events will be ignored. Select at least one to enable notifications.`,
      title: "Select notification access",
    });
  }

  if (input.eventCount > 0 && input.enabledEventCount === 0) {
    warnings.push({
      message: `No ${input.providerDisplayName} event types are enabled. Turn on at least one event to send notifications.`,
      title: "Enable notification events",
    });
  }

  if (input.channelsAvailable && !input.hasSubscribedConnectedChannel) {
    warnings.push({
      message:
        "No healthy notification channel is subscribed to this integration. Connect or repair a channel and enable it in Routing.",
      title: "Add a notification destination",
    });
  }

  if (input.channelErrorMessage !== null) {
    warnings.push({
      message: input.channelErrorMessage,
      title: "Notification routing unavailable",
    });
  }

  return warnings;
}
