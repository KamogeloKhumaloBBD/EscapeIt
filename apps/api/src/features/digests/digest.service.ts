import type {
  ActivityEvent,
  AppendActivityEventInput,
  CurrentWorkspace,
  DigestTrigger,
  ProviderKey,
  Workspace,
  WorkspaceDigestRecipient,
} from "@context-layer/db";
import type { DigestLink } from "@context-layer/email";

import { HttpError } from "../../errors";
import {
  groupDigestEvents,
  renderDigestGroups,
  type DigestSummarizer,
} from "../../integrations/summarizer/digest-summarizer";
import type { ProviderRegistry } from "../../integrations/provider-registry";
import { requireWorkspace } from "../shared/require-workspace";
import type { DigestEmailSender } from "./digest-email";

/**
 * Two ordinary notification preference keys, so members opt out through the
 * same sparse-override machinery as every provider event. Neither needs a
 * migration: `notification_preferences` only requires a namespaced key.
 */
export const dailyDigestEventKey = "digest.daily";
export const quietDayDigestEventKey = "digest.quiet-day";

const dailyDigestDefaultEnabled = true;
/**
 * Off by default. A member who wants confirmation that nothing happened can ask
 * for it, but silence is the better default for a day with no activity.
 */
const quietDayDigestDefaultEnabled = false;

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export interface DigestRepository {
  appendActivity(input: AppendActivityEventInput): Promise<unknown>;
  claimRun(input: {
    periodEnd: Date;
    periodStart: Date;
    trigger: DigestTrigger;
    workspaceId: string;
  }): Promise<string | null>;
  findCurrentWorkspace(userId: string): Promise<CurrentWorkspace | null>;
  findWorkspace(workspaceId: string): Promise<Workspace | null>;
  listDigestEvents(input: {
    periodEnd: Date;
    periodStart: Date;
    workspaceId: string;
  }): Promise<ActivityEvent[]>;
  listRecipients(input: {
    defaultEnabled: boolean;
    eventKey: string;
    workspaceId: string;
  }): Promise<WorkspaceDigestRecipient[]>;
  listResourceUrls(
    workspaceId: string,
  ): Promise<{ provider: ProviderKey; url: string | null }[]>;
  listWorkspacesWithActivity(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<string[]>;
  recordRunDelivery(runId: string, sentCount: number): Promise<void>;
}

export interface DigestServiceDependencies {
  appUrl: string;
  emailSender: DigestEmailSender;
  /**
   * Consulted only for `buildEventLink`. Turning an event into a link is
   * provider knowledge, so it lives on each provider's definition rather than
   * as a switch here.
   */
  providerRegistry: ProviderRegistry;
  repository: DigestRepository;
  /**
   * The UTC hour the schedule fires. It defines the window each run covers, so
   * it has to match the cron expression or digests will overlap or leave gaps.
   */
  sendHourUtc: number;
  /**
   * Optional on purpose. With no summarizer configured every digest is the
   * deterministic rendering, which is a complete product rather than a
   * degraded one.
   */
  summarizer: DigestSummarizer | null;
}

export interface DigestRunResult {
  digestsSent: number;
  workspacesConsidered: number;
}

/**
 * The window a scheduled run covers: the 24 hours ending at today's send time.
 *
 * Anchored to the send hour rather than to `now` for two reasons. It leaves no
 * gap — consecutive runs abut exactly, so work done after the send still appears
 * in tomorrow's digest, which a calendar-day window would drop. And it is stable
 * under retry: a run at 18:05 computes the same window as the one at 18:00, so
 * the claim in `digest_runs` still recognises it as the same digest.
 *
 * Fixed to UTC for every workspace, because per-workspace send times need a
 * workspace timezone setting that does not exist yet.
 */
export function scheduledDigestWindow(
  now: Date,
  sendHourUtc: number,
): { end: Date; start: Date } {
  const todaysSend = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      sendHourUtc,
    ),
  );
  // Before today's send time the run belongs to yesterday's window; a schedule
  // that slips past midnight must not skip a day.
  const end =
    now.getTime() >= todaysSend.getTime()
      ? todaysSend
      : new Date(todaysSend.getTime() - millisecondsPerDay);

  return { end, start: new Date(end.getTime() - millisecondsPerDay) };
}

function periodLabel(periodStart: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(periodStart);
}

export function createDigestService({
  appUrl,
  emailSender,
  providerRegistry,
  repository,
  sendHourUtc,
  summarizer,
}: DigestServiceDependencies) {
  /**
   * The links a digest can offer, one per thing mentioned. Built from the
   * events rather than from the model's sentence, so a link can only ever point
   * at something that actually happened.
   */
  async function resolveLinks(
    workspaceId: string,
    events: readonly ActivityEvent[],
  ): Promise<DigestLink[]> {
    const resourceUrls = new Map(
      (await repository.listResourceUrls(workspaceId)).map((row) => [
        row.provider,
        row.url,
      ]),
    );
    const seen = new Set<string>();

    return events.flatMap((event) => {
      if (event.provider === null) {
        return [];
      }

      const buildEventLink = providerRegistry.get(
        event.provider,
      )?.buildEventLink;
      const link = buildEventLink?.(
        event.metadata,
        resourceUrls.get(event.provider) ?? null,
      );

      // The same issue appears in several events; one link is enough.
      if (link === undefined || link === null || seen.has(link.url)) {
        return [];
      }

      seen.add(link.url);

      return [{ ...link, source: event.provider }];
    });
  }

  async function writeDigestProse(
    events: readonly ActivityEvent[],
  ): Promise<string> {
    const groups = groupDigestEvents(
      events.map((event) => ({
        provider: event.provider,
        summary: event.summary,
      })),
    );

    if (summarizer === null) {
      return renderDigestGroups(groups);
    }

    // A null result covers every way the model can let us down — asleep, slow,
    // or producing something that failed validation. The plain digest ships
    // instead, so a summarizer problem never becomes a delivery problem.
    return (await summarizer.summarize(groups)) ?? renderDigestGroups(groups);
  }

  async function sendWorkspaceDigest(
    workspaceId: string,
    period: { end: Date; start: Date },
    trigger: DigestTrigger,
    correlationId: string,
  ): Promise<number> {
    const workspace = await repository.findWorkspace(workspaceId);

    if (workspace === null) {
      return 0;
    }

    // Claimed before anything is generated or sent. A retried schedule or a
    // second replica loses the race here and does nothing, rather than both
    // discovering the clash after the emails have already gone out.
    const runId = await repository.claimRun({
      periodEnd: period.end,
      periodStart: period.start,
      trigger,
      workspaceId,
    });

    if (runId === null) {
      return 0;
    }

    const events = await repository.listDigestEvents({
      periodEnd: period.end,
      periodStart: period.start,
      workspaceId,
    });
    const isQuietDay = events.length === 0;
    const recipients = await repository.listRecipients({
      defaultEnabled: isQuietDay
        ? quietDayDigestDefaultEnabled
        : dailyDigestDefaultEnabled,
      eventKey: isQuietDay ? quietDayDigestEventKey : dailyDigestEventKey,
      workspaceId,
    });

    if (recipients.length === 0) {
      await repository.recordRunDelivery(runId, 0);
      return 0;
    }

    const digest = isQuietDay
      ? "Nothing came through from your connected tools."
      : await writeDigestProse(events);
    const label = periodLabel(period.start);
    const links = await resolveLinks(workspaceId, events);
    const deliveries = await Promise.all(
      recipients.map((recipient) =>
        emailSender.sendDigest({
          dashboardUrl: `${appUrl}/dashboard`,
          digest,
          eventCount: events.length,
          links,
          periodLabel: label,
          recipientEmail: recipient.email,
          workspaceName: workspace.name,
        }),
      ),
    );
    const sent = deliveries.filter((delivered) => delivered).length;

    await repository.recordRunDelivery(runId, sent);
    await repository.appendActivity({
      category: "notification",
      correlationId,
      metadata: {
        eventCount: events.length,
        periodStart: period.start.toISOString(),
        recipientCount: recipients.length,
        sentCount: sent,
      },
      operation: "digest.daily.sent",
      status:
        sent === recipients.length
          ? "succeeded"
          : sent === 0
            ? "failed"
            : "partially_succeeded",
      summary: `Daily digest sent to ${String(sent)} of ${String(recipients.length)} members`,
      workspaceId,
    });

    return sent;
  }

  return {
    /**
     * Every workspace with activity in the window. Workspaces without any are
     * skipped entirely rather than queried per member, so the run costs
     * inference time in proportion to real activity.
     *
     * Safe to retry: each workspace's digest is claimed in `digest_runs` before
     * anything is sent, so a repeat run finds the period taken and skips it.
     */
    async runScheduled(
      now: Date,
      correlationId: string,
    ): Promise<DigestRunResult> {
      const period = scheduledDigestWindow(now, sendHourUtc);
      const workspaceIds = await repository.listWorkspacesWithActivity(
        period.start,
        period.end,
      );
      let digestsSent = 0;

      // Sequential on purpose: the summarizer is a single small model on shared
      // CPU, and running workspaces concurrently would queue inside it anyway
      // while making a slow run look like a hung one.
      for (const workspaceId of workspaceIds) {
        digestsSent += await sendWorkspaceDigest(
          workspaceId,
          period,
          "scheduled",
          correlationId,
        );
      }

      return { digestsSent, workspacesConsidered: workspaceIds.length };
    },

    /**
     * An owner sending the day's digest early. It changes when the digest goes
     * out, never who receives it: opted-out members are still excluded, because
     * the recipient list is resolved the same way as a scheduled run.
     */
    async sendNow(userId: string, correlationId: string): Promise<number> {
      const current = requireWorkspace(
        await repository.findCurrentWorkspace(userId),
      );

      if (current.membership.role !== "owner") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only workspace owners can send the digest.",
        );
      }

      const now = new Date();
      const period = {
        end: now,
        start: new Date(now.getTime() - millisecondsPerDay),
      };

      return sendWorkspaceDigest(
        current.workspace.id,
        period,
        "manual",
        correlationId,
      );
    },
  };
}
