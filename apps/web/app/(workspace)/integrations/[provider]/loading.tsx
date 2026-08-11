import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function IntegrationDetailLoading() {
  return (
    <main
      aria-label="Loading integration"
      className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 lg:px-10 lg:pt-14"
      role="status"
    >
      <Skeleton className="h-9 w-28" />
      <div className="mt-8 flex gap-4">
        <Skeleton className="size-12" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
      </div>
      <div className="mt-10 space-y-6">
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
