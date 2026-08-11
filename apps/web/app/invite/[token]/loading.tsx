import { AppHeaderSkeleton } from "@/components/app-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvitationLoading() {
  return (
    <main className="min-h-screen bg-background">
      <AppHeaderSkeleton />
      <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-lg items-center px-6 pb-24">
        <Card className="w-full">
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-12 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
