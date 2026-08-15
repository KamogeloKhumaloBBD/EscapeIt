import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function IntegrationsLoading() {
  return (
    <WorkspacePage aria-label="Loading integrations" role="status">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-12 w-64" />
      <Skeleton className="mt-4 h-5 w-[32rem] max-w-full" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card className="shadow-none" key={item}>
            <CardHeader>
              <div className="flex gap-4">
                <Skeleton className="size-12" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </WorkspacePage>
  );
}
