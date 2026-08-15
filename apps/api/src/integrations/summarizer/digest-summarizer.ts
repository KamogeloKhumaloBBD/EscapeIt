/**
 * The boundary between the digest and whatever writes its prose. Everything
 * behind it is replaceable: today a self-hosted small model, tomorrow a hosted
 * one or nothing at all. `renderDigestGroups` is the deterministic rendering
 * every caller falls back to, so a summarizer is always optional.
 */

export interface DigestEvent {
  provider: string | null;
  summary: string;
}

export interface DigestGroup {
  source: string;
  summaries: readonly string[];
}

export interface DigestSummarizer {
  /**
   * Resolves to null whenever prose could not be produced or could not be
   * trusted. Callers render the groups themselves instead; a digest never fails
   * because the model was asleep, slow or wrong.
   */
  summarize(groups: readonly DigestGroup[]): Promise<string | null>;
}

/**
 * Grouping and counting are exact work, so they happen here rather than in a
 * prompt. A small model asked to both group and phrase will silently regroup
 * things wrongly; asked only to phrase pre-grouped events, it does the one job
 * it is good at.
 *
 * Repeats are collapsed to `summary (x3)` for the same reason. Handed three
 * identical lines the model reported "a new comment" — counting repeated lines
 * is arithmetic, and arithmetic is not what it is good at.
 */
export function groupDigestEvents(
  events: readonly DigestEvent[],
): DigestGroup[] {
  const grouped = new Map<string, Map<string, number>>();

  for (const event of events) {
    const source = event.provider ?? "workspace";
    const counts = grouped.get(source) ?? new Map<string, number>();

    counts.set(event.summary, (counts.get(event.summary) ?? 0) + 1);
    grouped.set(source, counts);
  }

  return [...grouped].map(([source, counts]) => ({
    source,
    summaries: [...counts].map(([summary, count]) =>
      count === 1
        ? summary
        : `${summary} — this happened ${String(count)} times`,
    ),
  }));
}

/**
 * The digest that ships when there is no summarizer, when it is unreachable, or
 * when its output failed validation. Plainer than the model's prose and always
 * correct, because it is only the events themselves.
 *
 * One line per tool, matching the shape the summarizer is asked for, so the
 * email renders both the same way and never has to know which it received.
 */
export function renderDigestGroups(groups: readonly DigestGroup[]): string {
  return groups
    .map((group) => `${group.source}: ${group.summaries.join("; ")}`)
    .join("\n");
}
