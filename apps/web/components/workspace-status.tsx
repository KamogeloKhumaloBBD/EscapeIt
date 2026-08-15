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
        tone === "ready" && "bg-emerald-600/8 text-emerald-700",
        tone === "setup" && "bg-amber-500/8 text-amber-700",
        tone === "attention" && "bg-destructive/8 text-destructive",
        tone === "disconnected" && "bg-muted/70 text-muted-foreground",
        className,
      )}
      variant="status"
    >
      <Icon aria-hidden="true" weight={tone === "ready" ? "fill" : "regular"} />
      {children}
    </Badge>
  );
}
