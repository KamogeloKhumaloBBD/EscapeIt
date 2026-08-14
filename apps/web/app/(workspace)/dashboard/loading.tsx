import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main
      aria-label="Loading dashboard"
      className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12"
      role="status"
    >
      <div>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-4 h-12 w-80 max-w-full" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      </div>
      <div className="mt-8 flex flex-col gap-3 border bg-card p-3 sm:flex-row">
        <Skeleton className="h-10 w-full sm:w-64" />
        <Skeleton className="h-10 w-full sm:w-44" />
        <Skeleton className="h-10 w-full sm:w-52" />
      </div>
      <div className="mt-9 grid overflow-hidden border bg-card sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="border-b p-6 sm:border-r xl:border-b-0" key={item}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-9 w-20" />
            <Skeleton className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>
      <Card className="mt-8">
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        {[0, 1].map((item) => (
          <Card key={item}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
