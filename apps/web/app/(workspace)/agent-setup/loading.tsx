import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function AgentSetupLoading() {
  return (
    <WorkspacePage aria-label="Loading agent setup" role="status">
      <Skeleton className="h-5 w-24 rounded-none" />
      <Skeleton className="mt-4 h-12 w-72 max-w-full rounded-none" />
      <Skeleton className="mt-3 h-6 w-full max-w-2xl rounded-none" />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 rounded-none" />
            <Skeleton className="h-4 w-full max-w-md rounded-none" />
          </CardHeader>
          <CardContent className="space-y-5">
            <Skeleton className="h-10 w-64 max-w-full rounded-none" />
            <Skeleton className="h-32 w-full rounded-none" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-36 rounded-none" />
            <Skeleton className="h-4 w-full max-w-md rounded-none" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full rounded-none" />
          </CardContent>
        </Card>
      </div>
      <Skeleton className="mt-10 h-16 w-full rounded-none" />
    </WorkspacePage>
  );
}
