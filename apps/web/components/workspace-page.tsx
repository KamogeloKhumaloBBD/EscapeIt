import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WorkspacePage({
  className,
  width = "wide",
  ...props
}: ComponentProps<"main"> & { width?: "focused" | "wide" }) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-5 pb-24 pt-8 sm:px-7 lg:px-10 lg:pt-11",
        width === "focused" ? "max-w-6xl" : "max-w-7xl",
        className,
      )}
      {...props}
    />
  );
}

export function WorkspaceSection({
  children,
  className,
  description,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.025em]">{title}</h2>
        {description === undefined ? null : (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
