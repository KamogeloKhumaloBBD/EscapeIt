import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentSetupLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-5 pt-9 pb-24 sm:px-7 lg:px-10 lg:pt-12">
      <Skeleton className="h-5 w-24 rounded-none" />
      <Skeleton className="mt-4 h-12 w-72 max-w-full rounded-none" />
      <Skeleton className="mt-3 h-6 w-full max-w-2xl rounded-none" />
      <Skeleton className="mt-8 h-12 w-full rounded-none" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
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
        <Card className="h-fit">
          <CardHeader>
            <Skeleton className="h-6 w-36 rounded-none" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full rounded-none" />
          </CardContent>
        </Card>
      </div>
      <Skeleton className="mt-10 h-16 w-full rounded-none" />
    </main>
  );
}
