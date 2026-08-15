import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function BundlesLoading() {
  return (
    <WorkspacePage aria-label="Loading bundles" role="status">
      <div className="flex items-start justify-between gap-6">
        <div className="w-full max-w-2xl">
          <Skeleton className="h-10 w-52 max-w-full" />
          <Skeleton className="mt-3 h-5 w-full" />
        </div>
        <Skeleton className="hidden h-10 w-32 sm:block" />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card key={item}>
            <CardHeader>
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-8 h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </WorkspacePage>
  );
}
