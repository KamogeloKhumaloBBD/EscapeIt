import type { Logger } from "pino";

import type { DigestGroup, DigestSummarizer } from "./digest-summarizer";

/**
 * Talks to a llama.cpp `llama-server` over the private network. The prompt and
 * sampling settings below were arrived at by running real activity through the
 * model; each one fixes an observed failure and the comments say which.
 */

const requestTimeoutMs = 60_000;
const maxOutputTokens = 200;
const maxLineCharacters = 600;
const urlPattern = /https?:\/\/\S+/gi;

/**
 * The example uses placeholder nouns and verbs that appear in no real event.
 * Earlier versions used realistic ones and the model copied them: given a
 * pull request that was only commented on, it reported the example's "opened
 * and merged" as well. The example may demonstrate shape and nothing else.
 */
const exampleBlock = [
  "",
  "Example of the compression wanted. Every word of it is a placeholder and none may appear in a digest:",
  "",
  "  Given: <THING-1> was frobbed / <THING-1> was wibbled — this happened 4 times",
  "  Write: <THING-1> was frobbed and wibbled four times.",
];

const systemPrompt = [
  "You rewrite a list of events from one tool as a single sentence for a software team's daily update.",
  "The events are already correct and complete. Your job is to compress them.",
  "",
  "Rules:",
  "- Reply with one sentence and nothing else.",
  "- Do not name the tool. It is already shown next to your sentence.",
  "- Every name, number and title you use must appear in the events, copied exactly.",
  "- Never say why something happened, or that one event caused another.",
  "- Never change what something is. A pull request stays a pull request, an issue stays an issue.",
  "- Combine every event about the same item into one clause.",
  "- When an event says how many times it happened, keep that number in your sentence.",
  "- Plain prose. No headings, no bullet characters, no emoji, no greeting, no sign-off.",
  ...exampleBlock,
].join("\n");

interface ChatCompletionResponse {
  choices: { message: { content: string } }[];
}

function buildUserPrompt(group: DigestGroup): string {
  return [
    `Today's events from ${group.source}:`,
    "",
    ...group.summaries.map((summary) => `- ${summary}`),
    "",
    "Write the sentence.",
  ].join("\n");
}

/**
 * The model may only rephrase what it was given, so any link it produces that
 * was not in the events is an invention. Rejecting the sentence is right: a
 * fabricated link in a team email is worse than plainer prose.
 */
function containsOnlyKnownUrls(line: string, prompt: string): boolean {
  return (line.match(urlPattern) ?? []).every((url) => prompt.includes(url));
}

/**
 * Collapses whatever shape came back into the single line the layout expects.
 * The model occasionally answers over several lines despite being asked not to,
 * and a stray newline would otherwise split one tool across two bullets.
 */
function toSingleLine(content: string): string {
  return content.replaceAll(/\s+/g, " ").trim();
}

function isUsable(line: string, prompt: string): boolean {
  return (
    line.length > 0 &&
    line.length <= maxLineCharacters &&
    containsOnlyKnownUrls(line, prompt)
  );
}

export interface LlamaServerSummarizerConfig {
  baseUrl: string;
  logger: Pick<Logger, "warn">;
}

export function createLlamaServerSummarizer({
  baseUrl,
  logger,
}: LlamaServerSummarizerConfig): DigestSummarizer {
  async function requestCompletion(prompt: string): Promise<string | null> {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      body: JSON.stringify({
        // The model is a hybrid thinking model. Reasoning tokens never reach
        // the digest but are still generated at CPU speed, so ask for none.
        chat_template_kwargs: { enable_thinking: false },
        // Without these the model latches onto its own last clause and repeats
        // it until it exhausts max_tokens.
        frequency_penalty: 0.5,
        max_tokens: maxOutputTokens,
        messages: [
          { content: systemPrompt, role: "system" },
          { content: prompt, role: "user" },
        ],
        presence_penalty: 0.3,
        // Low rather than zero: the task is rewriting, and invention is the
        // failure mode being guarded against.
        temperature: 0.1,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices[0]?.message.content;

    return content === undefined ? null : toSingleLine(content);
  }

  /**
   * One sentence, or null if the model could not produce a usable one.
   *
   * The digest is often the first request after a long idle period, and a
   * sleeping service answers that one with a gateway error while it wakes.
   * Without the second attempt the digest would fall back to plain text on
   * every run, which reads exactly like a model that never worked.
   */
  async function summarizeGroup(group: DigestGroup): Promise<string | null> {
    const prompt = buildUserPrompt(group);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const line = await requestCompletion(prompt);

        if (line !== null && isUsable(line, prompt)) {
          return line;
        }
      } catch {
        // Fall through to the retry, then to the caller's plain rendering.
      }
    }

    return null;
  }

  return {
    /**
     * One request per tool rather than one for the whole digest.
     *
     * The email renders a bullet per line, and asking a single request for one
     * line per tool produced every tool on one line — one bullet holding
     * everything. Layout is not the model's decision to make: this way the
     * shape is fixed by the loop, and a tool the model fails on falls back to
     * its own plain line while the rest keep their prose.
     */
    async summarize(groups) {
      const lines: string[] = [];
      let failures = 0;

      for (const group of groups) {
        const line = await summarizeGroup(group);

        if (line === null) {
          failures += 1;
          lines.push(`${group.source}: ${group.summaries.join("; ")}`);
          continue;
        }

        lines.push(`${group.source}: ${line}`);
      }

      if (failures > 0) {
        // Deliberately without the prompt or the completion: both carry
        // provider content, which must never reach the logs.
        logger.warn(
          { failedGroups: failures, totalGroups: groups.length },
          "Some digest sections fell back to their plain event list.",
        );
      }

      return lines.length === 0 ? null : lines.join("\n");
    },
  };
}
