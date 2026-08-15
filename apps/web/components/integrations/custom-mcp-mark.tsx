import { PlugsConnectedIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

const sizes = {
  md: "size-12",
  lg: "size-16",
} as const;

export function CustomMcpMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: keyof typeof sizes;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center border border-border bg-muted text-foreground",
        sizes[size],
        className,
      )}
    >
      <PlugsConnectedIcon className={size === "lg" ? "size-7" : "size-5"} />
    </span>
  );
}
