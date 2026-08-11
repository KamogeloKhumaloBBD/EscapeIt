import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function IntegrationsLoading() {
  return (
    <main
      aria-label="Loading integrations"
      className="mx-auto w-full max-w-6xl px-6 pb-24 pt-10 lg:px-10 lg:pt-14"
      role="status"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-12 w-64" />
      <Skeleton className="mt-4 h-5 w-[32rem] max-w-full" />
      <Card className="mt-10">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
