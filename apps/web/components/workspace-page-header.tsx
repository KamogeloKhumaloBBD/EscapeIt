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
        "flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-[-0.05em] text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
          {description}
        </p>
      </div>
      {action === undefined ? null : (
        <div className="flex shrink-0 flex-wrap gap-2 sm:pt-1">{action}</div>
      )}
    </header>
  );
}
