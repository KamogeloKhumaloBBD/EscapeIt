import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function McpInspectorLoading() {
  return (
    <WorkspacePage
      aria-label="Loading MCP inspector"
      className="max-w-[100rem]"
      role="status"
    >
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-6 w-full max-w-2xl" />
      <div className="mt-9 grid gap-3 border border-border bg-card p-3 md:grid-cols-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <div className="relative h-[min(760px,calc(100svh-14rem))] min-h-[560px] overflow-hidden border-x border-b border-border">
        <Skeleton className="absolute top-1/2 left-1/2 h-44 w-64 -translate-x-1/2 -translate-y-1/2" />
        <Skeleton className="absolute top-[12%] left-1/2 h-20 w-60 -translate-x-1/2" />
        <Skeleton className="absolute top-1/2 right-[8%] h-20 w-60 -translate-y-1/2" />
        <Skeleton className="absolute bottom-[12%] left-1/2 h-20 w-60 -translate-x-1/2" />
        <Skeleton className="absolute top-1/2 left-[8%] h-20 w-60 -translate-y-1/2" />
      </div>
    </WorkspacePage>
  );
}
