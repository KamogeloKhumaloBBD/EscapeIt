export interface AtlassianTextValue {
  markdown: string | null;
  text: string | null;
  truncated: boolean;
}

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
