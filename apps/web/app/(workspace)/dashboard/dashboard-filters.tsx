"use client";

import { FunnelSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MemberList } from "@/lib/validation/member";
import type { IntegrationSummary } from "@/lib/validation/integration";

import { DashboardDateRangePicker } from "./date-range-picker";

const allValue = "__all__";

export function DashboardFilters({
  end,
  integrations,
  members,
  selectedMembershipId,
  selectedProvider,
  start,
}: {
  end: string;
  integrations: IntegrationSummary[];
  members?: MemberList["members"];
  selectedMembershipId?: string;
  selectedProvider?: string;
  start: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const hasFilters =
    searchParams.has("start") ||
    searchParams.has("end") ||
    selectedProvider !== undefined ||
    selectedMembershipId !== undefined;

  function setFilter(key: "membershipId" | "provider", value: string): void {
    const search = new URLSearchParams(searchParams.toString());
    if (value === allValue) search.delete(key);
    else search.set(key, value);
    startTransition(() => {
      router.push(
        search.size === 0 ? "/dashboard" : `/dashboard?${search.toString()}`,
      );
    });
  }

  return (
    <section
      aria-label="Dashboard filters"
      className="mt-8 flex flex-col gap-3 border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <span className="flex items-center gap-2 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <FunnelSimpleIcon aria-hidden="true" /> Filters
      </span>
      <DashboardDateRangePicker end={end} start={start} />
      <Select
        disabled={pending}
        onValueChange={(value) => {
          setFilter("provider", value);
        }}
        value={selectedProvider ?? allValue}
      >
        <SelectTrigger
          aria-label="Filter by integration"
          className="min-w-44 border px-3"
        >
          <SelectValue placeholder="All integrations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allValue}>All integrations</SelectItem>
          {integrations.map((integration) => (
            <SelectItem key={integration.provider} value={integration.provider}>
              {integration.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {members === undefined ? null : (
        <Select
          disabled={pending}
          onValueChange={(value) => {
            setFilter("membershipId", value);
          }}
          value={selectedMembershipId ?? allValue}
        >
          <SelectTrigger
            aria-label="Filter by member"
            className="min-w-52 border px-3"
          >
            <SelectValue placeholder="All members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={allValue}>All members</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.membershipId} value={member.membershipId}>
                {member.name} · {member.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!hasFilters ? null : (
        <Button
          className="sm:ml-auto"
          disabled={pending}
          onClick={() => {
            startTransition(() => {
              const search = new URLSearchParams(searchParams.toString());
              search.delete("end");
              search.delete("membershipId");
              search.delete("provider");
              search.delete("start");
              router.push(`/dashboard?${search.toString()}`);
            });
          }}
          size="sm"
          variant="ghost"
        >
          <XIcon aria-hidden="true" /> Clear filters
        </Button>
      )}
    </section>
  );
}
