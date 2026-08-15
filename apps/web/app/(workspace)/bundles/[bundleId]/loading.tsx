import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function BundleDetailLoading() {
  return (
    <WorkspacePage
      aria-label="Loading bundle details"
      role="status"
      width="focused"
    >
      <Skeleton className="h-10 w-64 max-w-full" />
      <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
      {[0, 1].map((item) => (
        <Card className="mt-8" key={item}>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ))}
    </WorkspacePage>
  );
}
