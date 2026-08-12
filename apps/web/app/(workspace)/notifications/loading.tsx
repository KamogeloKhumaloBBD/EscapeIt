import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <main
      aria-label="Loading notifications"
      className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-7 lg:px-10 lg:pt-10"
      role="status"
    >
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-72" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="mt-10 space-y-4">
        {[0, 1].map((item) => (
          <Card key={item}>
            <CardHeader>
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
