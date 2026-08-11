import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function IntegrationDetailLoading() {
  return (
    <main
      aria-label="Loading integration"
      className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-7 lg:px-10 lg:pt-10"
      role="status"
    >
      <Skeleton className="h-9 w-28" />
      <div className="mt-6 flex gap-4 border bg-card p-8">
        <Skeleton className="size-16" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
      </div>
      <div className="mt-10 space-y-6 md:pl-14">
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
    </main>
  );
}
