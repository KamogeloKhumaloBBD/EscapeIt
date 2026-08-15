import { ProviderAdapterError } from "../integration-adapter";

const maximumTextCharacters = 50_000;

export function textToAdf(value: string): Record<string, unknown> {
  const normalized = value.replace(/\r\n?/g, "\n");
  if (normalized.length > maximumTextCharacters) {
    throw new ProviderAdapterError("content_too_large");
  }
  return {
    content: normalized.split("\n").map((line) => ({
      content: line.length === 0 ? [] : [{ text: line, type: "text" }],
      type: "paragraph",
    })),
    type: "doc",
    version: 1,
  };
}
