import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePage } from "@/components/workspace-page";

export default function MembersLoading() {
  return (
    <WorkspacePage aria-label="Loading members" role="status">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-4 h-12 w-80 max-w-full" />
      <Skeleton className="mt-3 h-5 w-[34rem] max-w-full" />
      <div className="mt-10 grid overflow-hidden border bg-card sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div
            className="border-t p-6 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"
            key={key}
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-8 w-12" />
          </div>
        ))}
      </div>
      {["invite", "members", "pending"].map((key) => (
        <Card className="mt-8" key={key}>
          <CardHeader>
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      ))}
    </WorkspacePage>
  );
}
