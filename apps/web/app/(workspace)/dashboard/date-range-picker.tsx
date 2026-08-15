"use client";

import { CalendarBlankIcon } from "@phosphor-icons/react";
import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function dateParameter(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

export function DashboardDateRangePicker({
  end,
  start,
}: {
  end: string;
  start: string;
}) {
  const router = useRouter();
  const currentSearch = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>({
    from: parseISO(start),
    to: parseISO(end),
  });

  function applyRange(): void {
    if (range?.from === undefined || range.to === undefined) {
      setError("Select both a start and end date.");
      return;
    }

    if (differenceInCalendarDays(range.to, range.from) > 365) {
      setError("Choose a range of 366 days or fewer.");
      return;
    }

    setError(null);
    const search = new URLSearchParams(currentSearch.toString());
    search.delete("timeZone");
    search.set("end", dateParameter(range.to));
    search.set("start", dateParameter(range.from));
    startTransition(() => {
      router.push(`/dashboard?${search.toString()}`);
      setOpen(false);
    });
  }

  function resetRange(): void {
    const today = new Date();
    setRange({ from: subDays(today, 29), to: today });
    setError(null);
    startTransition(() => {
      const search = new URLSearchParams(currentSearch.toString());
      search.delete("timeZone");
      search.delete("start");
      search.delete("end");
      router.push(
        search.size === 0 ? "/dashboard" : `/dashboard?${search.toString()}`,
      );
      setOpen(false);
    });
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Choose analytics date range"
          className="w-full justify-start sm:w-auto"
          disabled={pending}
          variant="outline"
        >
          <CalendarBlankIcon aria-hidden="true" />
          {format(parseISO(start), "MMM d, yyyy")} –{" "}
          {format(parseISO(end), "MMM d, yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          {...(range?.from === undefined ? {} : { defaultMonth: range.from })}
          disabled={{ after: new Date() }}
          mode="range"
          numberOfMonths={1}
          onSelect={(value) => {
            setRange(value);
            setError(null);
          }}
          {...(range === undefined ? {} : { selected: range })}
        />
        <div className="border-t border-border px-3 py-3">
          {error === null ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Dates use your local time and may span up to 366 days.
            </p>
          ) : (
            <p className="mb-3 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button onClick={resetRange} size="sm" variant="ghost">
              Last 30 days
            </Button>
            <Button disabled={pending} onClick={applyRange} size="sm">
              {pending ? "Applying…" : "Apply range"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
