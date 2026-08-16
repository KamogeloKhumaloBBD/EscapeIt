"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

export type ToolKindFilter = "all" | "read" | "write";

export function matchesToolFilter(
  tool: {
    description: string;
    kind: "read" | "write";
    searchableNames: readonly string[];
  },
  query: string,
  kindFilter: ToolKindFilter,
): boolean {
  if (kindFilter !== "all" && tool.kind !== kindFilter) {
    return false;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (normalizedQuery === "") {
    return true;
  }

  return [tool.description, ...tool.searchableNames].some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function ToolSelectorFilters({
  disabled = false,
  kindFilter,
  onKindFilterChange,
  onQueryChange,
  query,
}: {
  disabled?: boolean;
  kindFilter: ToolKindFilter;
  onKindFilterChange: (value: ToolKindFilter) => void;
  onQueryChange: (value: string) => void;
  query: string;
}) {
  const filters = [
    ["all", "All"],
    ["read", "Read"],
    ["write", "Write"],
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <InputGroup className="border border-border px-3">
        <InputGroupAddon>
          <MagnifyingGlassIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search MCP tools"
          disabled={disabled}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          placeholder="Search MCP tools"
          type="search"
          value={query}
        />
      </InputGroup>
      <ButtonGroup aria-label="Filter MCP tools by access type">
        {filters.map(([value, label]) => (
          <Button
            aria-pressed={kindFilter === value}
            disabled={disabled}
            key={value}
            onClick={() => {
              onKindFilterChange(value);
            }}
            size="sm"
            type="button"
            variant={kindFilter === value ? "secondary" : "outline"}
          >
            {label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}
