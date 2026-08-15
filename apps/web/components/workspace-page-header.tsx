import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WorkspacePageHeader({
  action,
  description,
  title,
  className,
}: {
  action?: ReactNode;
  description: ReactNode;
  title: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-[-0.055em] text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          {description}
        </p>
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </header>
  );
}
