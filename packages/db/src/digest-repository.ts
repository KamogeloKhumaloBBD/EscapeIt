import type { DatabaseClient } from "./client";
import { createProductId } from "./repository-helpers";

export type DigestTrigger = "manual" | "scheduled";

export interface DigestRun {
  createdAt: Date;
  id: string;
  periodEnd: Date;
  periodStart: Date;
  sentCount: number;
  trigger: DigestTrigger;
  workspaceId: string;
}

export interface ClaimDigestRunInput {
  periodEnd: Date;
  periodStart: Date;
  trigger: DigestTrigger;
  workspaceId: string;
}

/**
 * Claims the right to send one workspace's digest for a period, returning the
 * run id, or null when another run already holds it.
 *
 * The claim is taken before anything is sent, so a retried schedule or a second
 * replica loses the race and sends nothing. Recording the run afterwards would
 * leave both senders believing they were first.
 *
 * A manual send passes the moment it was triggered as `periodStart`, which is
 * always unique — the constraint exists to make the schedule idempotent, not to
 * stop an owner sending twice. That limit belongs at the route.
 */
export async function claimDigestRun(
  database: DatabaseClient,
  input: ClaimDigestRunInput,
): Promise<string | null> {
  const rows = await database<{ id: string }[]>`
    insert into digest_runs (
      id,
      "workspaceId",
      "periodStart",
      "periodEnd",
      trigger,
      "sentCount"
    ) values (
      ${createProductId()},
      ${input.workspaceId},
      ${input.periodStart},
      ${input.periodEnd},
      ${input.trigger},
      0
    )
    on conflict ("workspaceId", "periodStart") do nothing
    returning id
  `;

  return rows[0]?.id ?? null;
}

/**
 * Closes out a claimed run. Kept separate from the claim because the number
 * sent is only known once delivery has been attempted.
 */
export async function recordDigestRunDelivery(
  database: DatabaseClient,
  runId: string,
  sentCount: number,
): Promise<void> {
  await database`
    update digest_runs
    set "sentCount" = ${sentCount}
    where id = ${runId}
  `;
}
