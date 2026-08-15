import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function CustomMcpDetailLoading() {
  return (
    <WorkspacePage
      aria-label="Loading Custom MCP server"
      role="status"
      width="focused"
    >
      <div className="border border-border bg-card p-6 sm:p-8">
        <div className="flex gap-5">
          <Skeleton className="size-16 shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-10 w-64 max-w-full" />
            <Skeleton className="h-5 w-[32rem] max-w-full" />
          </div>
        </div>
        <div className="mt-8 grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton className="h-16" key={item} />
          ))}
        </div>
      </div>
      <Skeleton className="mt-8 h-12 w-full" />
      <div className="mt-8 space-y-6">
        {[0, 1, 2].map((item) => (
          <Card key={item}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-[32rem] max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-28 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </WorkspacePage>
  );
}
