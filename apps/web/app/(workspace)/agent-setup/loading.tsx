import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentSetupLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-24 pt-9 sm:px-7 lg:px-10 lg:pt-12">
      <Skeleton className="h-5 w-24 rounded-none" />
      <Skeleton className="mt-4 h-12 w-72 max-w-full rounded-none" />
      <Skeleton className="mt-3 h-6 w-full max-w-2xl rounded-none" />
      <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 rounded-none" />
            <Skeleton className="h-4 w-full max-w-md rounded-none" />
          </CardHeader>
          <CardContent className="space-y-5">
            <Skeleton className="h-16 w-full rounded-none" />
            <Skeleton className="h-40 w-full rounded-none" />
          </CardContent>
        </Card>
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40 rounded-none" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full rounded-none" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-36 rounded-none" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-56 w-full rounded-none" />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
