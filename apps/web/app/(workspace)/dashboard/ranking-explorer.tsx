"use client";

import {
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { ProviderMark } from "@/components/integrations/provider-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MemberUsage, ToolUsage } from "@/lib/validation/workspace";

const pageSize = 25;

type RankingItem = MemberUsage | ToolUsage;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

function percent(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function isTool(item: RankingItem): item is ToolUsage {
  return "toolName" in item;
}

export function RankingExplorer({
  dimension,
  filters,
  initialItems,
  initialTotal,
  providerNames,
}: {
  dimension: "member" | "tool";
  filters: {
    end: string;
    membershipId?: string;
    provider?: string;
    start: string;
    timeZone: string;
  };
  initialItems: RankingItem[];
  initialTotal: number;
  providerNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState("calls");
  const [direction, setDirection] = useState("desc");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RankingItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [requestState, setRequestState] = useState({
    failed: false,
    key: "",
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  const requestKey = JSON.stringify({
    debouncedQuery,
    dimension,
    direction,
    filters,
    offset,
    sort,
  });
  const loading = open && requestState.key !== requestKey;
  const failed = requestState.key === requestKey && requestState.failed;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      dimension,
      direction,
      end: filters.end,
      limit: String(pageSize),
      offset: String(offset),
      query: debouncedQuery,
      sort,
      start: filters.start,
      timeZone: filters.timeZone,
    });
    if (filters.provider !== undefined)
      parameters.set("provider", filters.provider);
    if (filters.membershipId !== undefined)
      parameters.set("membershipId", filters.membershipId);

    void fetch(`/api/workspaces/current/analytics/rankings?${parameters}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Ranking request failed");
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          body === null ||
          !("data" in body) ||
          typeof body.data !== "object" ||
          body.data === null
        ) {
          throw new Error("Ranking response is invalid");
        }
        const data = body.data as Record<string, unknown>;
        if (!Array.isArray(data.items) || typeof data.total !== "number") {
          throw new Error("Ranking response is invalid");
        }
        setItems(data.items as RankingItem[]);
        setTotal(data.total);
        setRequestState({ failed: false, key: requestKey });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRequestState({ failed: true, key: requestKey });
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    debouncedQuery,
    dimension,
    direction,
    filters,
    offset,
    open,
    requestKey,
    sort,
  ]);

  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + pageSize, total);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          View all
        </Button>
      </SheetTrigger>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:w-[min(48rem,calc(100vw-2rem))] data-[side=right]:sm:max-w-none">
        <SheetHeader className="border-b border-border pb-6">
          <SheetTitle>
            {dimension === "tool" ? "Tool usage" : "Member usage"}
          </SheetTitle>
          <SheetDescription>
            Search and sort usage within the dashboard&apos;s active filters.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={`Search ${dimension} usage`}
              className="pl-10"
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
              placeholder={
                dimension === "tool"
                  ? "Search tools or providers"
                  : "Search names or emails"
              }
              value={query}
            />
          </div>
          <Select
            onValueChange={(value) => {
              setSort(value);
              setOffset(0);
            }}
            value={sort}
          >
            <SelectTrigger
              aria-label="Sort rankings"
              className="border px-3 sm:w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calls">Tool calls</SelectItem>
              <SelectItem value="failures">Failures</SelectItem>
              <SelectItem value="success-rate">Success rate</SelectItem>
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => {
              setDirection(value);
            }}
            value={direction}
          >
            <SelectTrigger
              aria-label="Sort direction"
              className="border px-3 sm:w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">High to low</SelectItem>
              <SelectItem value="asc">Low to high</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6">
          {failed ? (
            <p className="py-12 text-center text-sm text-destructive">
              Usage rankings could not be loaded.
            </p>
          ) : items.length === 0 && !loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No matching usage found.
            </p>
          ) : (
            <Table className={loading ? "opacity-55" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {dimension === "tool" ? "Tool" : "Member"}
                  </TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Failures</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  {dimension === "member" ? (
                    <TableHead>Last active</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={
                      isTool(item)
                        ? `${item.provider}:${item.toolName}`
                        : item.membershipId
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {isTool(item) ? (
                          <ProviderMark
                            displayName={
                              providerNames[item.provider] ?? item.provider
                            }
                            provider={item.provider}
                            size="sm"
                          />
                        ) : (
                          <Avatar size="sm">
                            <AvatarFallback>
                              {initials(item.email)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className="min-w-0">
                          <p
                            className={
                              isTool(item)
                                ? "font-mono text-xs font-medium"
                                : "font-medium"
                            }
                          >
                            {isTool(item) ? item.toolName : item.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {isTool(item)
                              ? (providerNames[item.provider] ?? item.provider)
                              : item.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {item.toolCallCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {item.failedCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {percent(item.successRate)}
                    </TableCell>
                    {!isTool(item) ? (
                      <TableCell className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                        }).format(new Date(item.lastUsedAt))}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border p-6">
          <p className="text-xs text-muted-foreground">
            {first}–{last} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              aria-label="Previous results page"
              disabled={loading || offset === 0}
              onClick={() => {
                setOffset(Math.max(0, offset - pageSize));
              }}
              size="icon-sm"
              variant="outline"
            >
              <CaretLeftIcon aria-hidden="true" />
            </Button>
            <Button
              aria-label="Next results page"
              disabled={loading || offset + pageSize >= total}
              onClick={() => {
                setOffset(offset + pageSize);
              }}
              size="icon-sm"
              variant="outline"
            >
              <CaretRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
