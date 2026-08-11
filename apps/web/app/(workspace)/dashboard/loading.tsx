import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main
      aria-label="Loading dashboard"
      className="mx-auto w-full max-w-6xl px-6 pb-24 pt-10 lg:px-10 lg:pt-14"
      role="status"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-12 w-80" />
      <Skeleton className="mt-4 h-5 w-96 max-w-full" />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card key={item} size="sm">
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-12" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="mt-10 max-w-3xl">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-1 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
      {[0, 1].map((item) => (
        <Card className="mt-8" key={item}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
