"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { parseIntegrationCatalogTab } from "./integration-tab";

export function IntegrationCatalogTabs({
  custom,
  platform,
}: {
  custom: ReactNode;
  platform: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const selected = parseIntegrationCatalogTab(searchParams.get("tab"));

  function selectTab(value: string) {
    const tab = parseIntegrationCatalogTab(value);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    startTransition(() => {
      router.replace(`/integrations?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <Tabs
      aria-busy={pending}
      className="mt-8 gap-6"
      onValueChange={selectTab}
      value={selected}
    >
      <div className="flex items-center gap-2 border-b border-border">
        <TabsList className="h-11" variant="line">
          <TabsTrigger value="platform">Platform</TabsTrigger>
          <TabsTrigger value="custom">Custom MCP</TabsTrigger>
        </TabsList>
        {pending ? (
          <Spinner
            aria-label="Loading integration catalog"
            className="ml-auto text-muted-foreground"
          />
        ) : null}
      </div>
      <TabsContent value="platform">{platform}</TabsContent>
      <TabsContent value="custom">{custom}</TabsContent>
    </Tabs>
  );
}
