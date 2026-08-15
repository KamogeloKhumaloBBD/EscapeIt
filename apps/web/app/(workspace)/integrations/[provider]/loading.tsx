import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function IntegrationDetailLoading() {
  return (
    <WorkspacePage
      aria-label="Loading integration"
      role="status"
      width="focused"
    >
      <Skeleton className="h-9 w-28" />
      <div className="mt-6 flex gap-4 border bg-card p-8">
        <Skeleton className="size-16" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
      </div>
      <div className="mt-10 space-y-6">
        {[0, 1, 2].map((item) => (
          <Card key={item}>
            <CardHeader>
              <Skeleton className="h-6 w-56" />
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
