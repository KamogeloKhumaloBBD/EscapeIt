import { Buffer } from "node:buffer";

import { ProviderAdapterError } from "../integration-adapter";

export const maximumAttachmentBytes = 10 * 1024 * 1024;
export const maximumInlineImageBytes = 5 * 1024 * 1024;
export const maximumExtractedCharacters = 50_000;

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
