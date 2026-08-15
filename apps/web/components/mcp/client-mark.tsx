import Image from "next/image";

import { cn } from "@/lib/utils";

const sizes = {
  md: { glyph: "size-5", tile: "size-10" },
  sm: { glyph: "size-3.5", tile: "size-5" },
} as const;

type ClientKind = "claude" | "codex" | "cursor" | "generic" | "kiro" | "vscode";

const clientLogos: Partial<Record<ClientKind, string>> = {
  cursor: "/client-logos/cursor.svg",
  kiro: "/client-logos/kiro.svg",
  vscode: "/client-logos/vscode.svg",
};

function clientKind(clientName: string): ClientKind {
  const normalizedName = clientName.toLowerCase();

  if (normalizedName.includes("kiro")) return "kiro";
  if (normalizedName.includes("cursor")) return "cursor";
  if (
    normalizedName.includes("visual studio code") ||
    normalizedName.includes("vs code") ||
    normalizedName.includes("vscode")
  ) {
    return "vscode";
  }

  if (
    normalizedName.includes("claude") ||
    normalizedName.includes("anthropic")
  ) {
    return "claude";
  }

  if (normalizedName.includes("codex") || normalizedName.includes("openai")) {
    return "codex";
  }

  return "generic";
}

function ClaudeGlyph({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2.5v19M2.5 12h19M5.28 5.28l13.44 13.44M18.72 5.28 5.28 18.72M8.18 2.96l7.64 18.08M21.04 8.18 2.96 15.82M15.82 2.96 8.18 21.04M21.04 15.82 2.96 8.18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CodexGlyph({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3.05a4.1 4.1 0 0 1 3.55 2.05l.62 1.08 1.25-.01a4.1 4.1 0 0 1 3.55 6.15l-.63 1.08.63 1.08a4.1 4.1 0 0 1-3.55 6.15h-1.25l-.62 1.08a4.1 4.1 0 0 1-7.1 0l-.62-1.08H6.58a4.1 4.1 0 0 1-3.55-6.15l.63-1.08-.63-1.08a4.1 4.1 0 0 1 3.55-6.15l1.25.01.62-1.08A4.1 4.1 0 0 1 12 3.05Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.65"
      />
      <path
        d="m8.03 6.18 7.94 4.58v5.48L12 18.53l-3.97-2.29v-5.48L12 8.47l3.97 2.29M8.03 10.76 12 13.05l3.97-2.29M12 13.05v5.48"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.65"
      />
    </svg>
  );
}

function GenericGlyph({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.25 8.25 6.4 6.4a3.2 3.2 0 0 0-4.52 4.52l2.55 2.55a3.2 3.2 0 0 0 4.52 0l1.34-1.34m3.42-.26 1.34-1.34a3.2 3.2 0 0 1 4.52 0l2.55 2.55a3.2 3.2 0 0 1-4.52 4.52l-1.85-1.85M8.7 15.3l6.6-6.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function McpClientMark({
  className,
  clientName,
  size = "md",
}: {
  className?: string;
  clientName: string;
  size?: keyof typeof sizes;
}) {
  const kind = clientKind(clientName);
  const dimensions = sizes[size];
  const logo = clientLogos[kind];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-xs",
        dimensions.tile,
        kind === "codex" && "bg-[#111111] text-white",
        kind === "claude" && "bg-[#d97757] text-[#fffaf3]",
        kind === "generic" && "border bg-muted text-foreground",
        logo !== undefined && "bg-transparent",
        kind === "vscode" && "p-0.5",
        className,
      )}
    >
      {logo !== undefined ? (
        <Image
          alt=""
          className="size-full object-contain"
          height={40}
          src={logo}
          width={40}
        />
      ) : kind === "codex" ? (
        <CodexGlyph className={dimensions.glyph} />
      ) : kind === "claude" ? (
        <ClaudeGlyph className={dimensions.glyph} />
      ) : (
        <GenericGlyph className={dimensions.glyph} />
      )}
    </span>
  );
}
