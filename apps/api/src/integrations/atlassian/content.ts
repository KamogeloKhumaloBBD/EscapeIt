import { Buffer } from "node:buffer";

import { ProviderAdapterError } from "../integration-adapter";

export const maximumAttachmentBytes = 10 * 1024 * 1024;
export const maximumInlineImageBytes = 5 * 1024 * 1024;
export const maximumExtractedCharacters = 50_000;

export interface AtlassianTextValue {
  markdown: string | null;
  text: string | null;
  truncated: boolean;
}

export interface AttachmentMetadata {
  author: string | null;
  createdAt: string;
  filename: string;
  id: string;
  mimeType: string;
  size: number;
}

export type AtlassianAttachmentContent =
  | {
      content: string;
      format: "docx" | "json" | "markdown" | "pdf" | "text";
      kind: "text";
      metadata: AttachmentMetadata;
      truncated: boolean;
    }
  | {
      data: string;
      kind: "image";
      metadata: AttachmentMetadata;
      mimeType: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
    };

function normalize(value: string): string {
  return value
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function safeMarkdownLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replaceAll("(", "%28").replaceAll(")", "%29");
  } catch {
    return null;
  }
}

export function adfToTextValue(
  value: unknown,
  maximumCharacters: number,
): AtlassianTextValue {
  if (value === null || value === undefined) {
    return { markdown: null, text: null, truncated: false };
  }

  if (typeof value === "string") {
    const normalized = normalize(value);
    const truncated = normalized.length > maximumCharacters;
    const content = normalized.slice(0, maximumCharacters) || null;
    return { markdown: content, text: content, truncated };
  }

  let visited = 0;
  const structuralState = { truncated: false };

  function render(node: unknown, orderedIndex = 1): string {
    if (visited >= 20_000) {
      structuralState.truncated = true;
      return "";
    }
    if (Array.isArray(node)) return node.map((child) => render(child)).join("");
    if (typeof node !== "object" || node === null) return "";

    visited += 1;
    const record = node as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    const attrs =
      typeof record.attrs === "object" && record.attrs !== null
        ? (record.attrs as Record<string, unknown>)
        : {};
    if (type === "bulletList" || type === "orderedList") {
      const children = Array.isArray(record.content) ? record.content : [];
      return `${children
        .map((child, index) => {
          const rendered = render(child, index + 1).trim();
          const marker = type === "orderedList" ? `${String(index + 1)}.` : "-";
          return `${marker} ${rendered.replace(/\n/g, "\n  ")}`;
        })
        .join("\n")}\n\n`;
    }
    let content = render(record.content);

    if (typeof record.text === "string") {
      content = escapeMarkdown(record.text);
      if (Array.isArray(record.marks)) {
        for (const mark of record.marks) {
          if (typeof mark !== "object" || mark === null) continue;
          const markRecord = mark as Record<string, unknown>;
          if (markRecord.type === "strong") content = `**${content}**`;
          if (markRecord.type === "em") content = `_${content}_`;
          if (markRecord.type === "strike") content = `~~${content}~~`;
          if (markRecord.type === "code")
            content = `\`${content.replaceAll("`", "\\`")}\``;
          if (markRecord.type === "link") {
            const markAttrs = markRecord.attrs as
              Record<string, unknown> | undefined;
            const href =
              typeof markAttrs?.href === "string" ? markAttrs.href : "";
            const safeHref = safeMarkdownLink(href);
            if (safeHref !== null) content = `[${content}](${safeHref})`;
          }
        }
      }
      return content;
    }

    switch (type) {
      case "hardBreak":
        return "  \n";
      case "paragraph":
        return `${content}\n\n`;
      case "heading": {
        const level =
          typeof attrs.level === "number"
            ? Math.min(6, Math.max(1, attrs.level))
            : 1;
        return `${"#".repeat(level)} ${content}\n\n`;
      }
      case "blockquote":
        return `${content
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n\n`;
      case "codeBlock":
        return `\`\`\`\n${content.trimEnd()}\n\`\`\`\n\n`;
      case "listItem":
        return content || String(orderedIndex);
      case "rule":
        return "---\n\n";
      case "tableRow":
        return `| ${content.trim().replace(/\n+/g, " ")} |\n`;
      case "tableCell":
      case "tableHeader":
        return `${content.trim()} | `;
      case "table":
        return `${content}\n`;
      default:
        return content;
    }
  }

  const markdown = normalize(render(value));
  const plain = normalize(
    markdown
      .replace(/```[\s\S]*?```/g, (block) => block.slice(3, -3))
      .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}(?:#{1,6}|>|[-*+] |\d+\. )\s*/gm, "")
      .replace(/[*_~`]/g, ""),
  );
  const truncated =
    structuralState.truncated ||
    markdown.length > maximumCharacters ||
    plain.length > maximumCharacters;

  return {
    markdown: markdown.slice(0, maximumCharacters) || null,
    text: plain.slice(0, maximumCharacters) || null,
    truncated,
  };
}

export function textToAdf(value: string): Record<string, unknown> {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  return {
    content: lines.map((line) => ({
      content: line.length === 0 ? [] : [{ text: line, type: "text" }],
      type: "paragraph",
    })),
    type: "doc",
    version: 1,
  };
}

function limitedText(value: string): { content: string; truncated: boolean } {
  const normalized = normalize(value);
  return {
    content: normalized.slice(0, maximumExtractedCharacters),
    truncated: normalized.length > maximumExtractedCharacters,
  };
}

export async function extractAttachment(
  metadata: AttachmentMetadata,
  bytes: Uint8Array,
  responseMimeType: string,
): Promise<AtlassianAttachmentContent> {
  const declared = metadata.mimeType.toLowerCase();
  const actual = responseMimeType.toLowerCase();
  if (actual && actual !== "application/octet-stream" && actual !== declared) {
    throw new ProviderAdapterError("unsupported_content");
  }
  const mimeType =
    !actual || actual === "application/octet-stream" ? declared : actual;
  type SupportedImageMime =
    "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  const supportedImages = new Set<SupportedImageMime>([
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  function isSupportedImage(value: string): value is SupportedImageMime {
    return supportedImages.has(value as SupportedImageMime);
  }

  if (isSupportedImage(mimeType) && isSupportedImage(declared)) {
    if (bytes.byteLength > maximumInlineImageBytes) {
      throw new ProviderAdapterError("content_too_large");
    }
    const validSignature =
      (mimeType === "image/png" &&
        Buffer.from(bytes.slice(0, 8)).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )) ||
      (mimeType === "image/jpeg" &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes.at(-2) === 0xff &&
        bytes.at(-1) === 0xd9) ||
      (mimeType === "image/gif" &&
        /^GIF8[79]a$/.exec(new TextDecoder().decode(bytes.slice(0, 6))) !==
          null) ||
      (mimeType === "image/webp" &&
        new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP");
    if (!validSignature) throw new ProviderAdapterError("invalid_response");
    return {
      data: Buffer.from(bytes).toString("base64"),
      kind: "image",
      metadata,
      mimeType,
    };
  }

  if (mimeType === "image/svg+xml" || declared === "image/svg+xml") {
    throw new ProviderAdapterError("unsupported_content");
  }

  const filename = metadata.filename.toLowerCase();
  if (
    mimeType.startsWith("text/") ||
    [
      "application/json",
      "application/xml",
      "application/yaml",
      "application/x-yaml",
    ].includes(mimeType)
  ) {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const limited = limitedText(decoded);
    const format =
      mimeType === "application/json"
        ? "json"
        : mimeType === "text/markdown" ||
            filename.endsWith(".md") ||
            filename.endsWith(".markdown")
          ? "markdown"
          : "text";
    return { ...limited, format, kind: "text", metadata };
  }

  if (
    mimeType === "application/pdf" &&
    bytes
      .slice(0, 5)
      .every((value, index) => value === "%PDF-".charCodeAt(index))
  ) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const document = await pdfjs.getDocument({ data: bytes }).promise;
      const pages: string[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const text = await page.getTextContent();
        pages.push(
          text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        );
        if (pages.join("\n\n").length > maximumExtractedCharacters) break;
      }
      const limited = limitedText(pages.join("\n\n"));
      return { ...limited, format: "pdf", kind: "text", metadata };
    } catch {
      throw new ProviderAdapterError("invalid_response");
    }
  }

  const docxMime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (mimeType === docxMime && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      const limited = limitedText(result.value);
      return { ...limited, format: "docx", kind: "text", metadata };
    } catch {
      throw new ProviderAdapterError("invalid_response");
    }
  }

  throw new ProviderAdapterError("unsupported_content");
}
