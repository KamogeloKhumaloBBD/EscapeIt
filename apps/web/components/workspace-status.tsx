import {
  CheckCircleIcon,
  CircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type WorkspaceStatusTone =
  "attention" | "disconnected" | "ready" | "setup";

export function WorkspaceStatus({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone: WorkspaceStatusTone;
}) {
  const Icon =
    tone === "ready"
      ? CheckCircleIcon
      : tone === "attention"
        ? WarningCircleIcon
        : CircleIcon;

  return (
    <Badge
      className={cn(
        tone === "ready" &&
          "border-emerald-600/20 bg-emerald-600/8 text-emerald-700",
        tone === "setup" && "border-amber-600/20 bg-amber-500/8 text-amber-700",
        className,
      )}
      variant={
        tone === "attention"
          ? "destructive"
          : tone === "disconnected"
            ? "secondary"
            : "outline"
      }
    >
      <Icon aria-hidden="true" weight={tone === "ready" ? "fill" : "regular"} />
      {children}
    </Badge>
  );
}
