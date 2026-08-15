"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  ArrowsOutIcon,
  CaretDownIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BrandIcon } from "@/components/brand-icon";
import { ProviderMark } from "@/components/integrations/provider-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  McpInspectorBundle,
  McpInspectorData,
  McpInspectorProvider,
  McpInspectorTool,
} from "@/lib/server/mcp-inspector";
import { cn } from "@/lib/utils";

const ALL_PROVIDERS = "all";
const PROVIDER_RADIUS_X = 390;
const PROVIDER_RADIUS_Y = 275;

type Direction = "bottom" | "left" | "right" | "top";
type InspectorSelection =
  | { provider: string; type: "provider" }
  | { provider: string; tool: string; type: "tool" };

interface CoreNodeData extends Record<string, unknown> {
  scopeLabel: string;
  toolCount: number;
  totalProviderCount: number;
  usableProviderCount: number;
}

interface ProviderNodeData extends Record<string, unknown> {
  direction: Direction;
  expanded: boolean;
  provider: McpInspectorProvider;
}

interface ToolNodeData extends Record<string, unknown> {
  direction: Direction;
  providerDisplayName: string;
  providerKey: string;
  tool: McpInspectorTool;
}

type CoreFlowNode = Node<CoreNodeData, "core">;
type ProviderFlowNode = Node<ProviderNodeData, "provider">;
type ToolFlowNode = Node<ToolNodeData, "tool">;
type InspectorFlowNode = CoreFlowNode | ProviderFlowNode | ToolFlowNode;

function handlePosition(direction: Direction): Position {
  switch (direction) {
    case "bottom":
      return Position.Bottom;
    case "left":
      return Position.Left;
    case "right":
      return Position.Right;
    case "top":
      return Position.Top;
  }
}

function opposite(direction: Direction): Direction {
  switch (direction) {
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
  }
}

function directionForAngle(angle: number): Direction {
  const x = Math.cos(angle);
  const y = Math.sin(angle);

  if (Math.abs(x) > Math.abs(y)) return x >= 0 ? "right" : "left";
  return y >= 0 ? "bottom" : "top";
}

function HiddenHandle({
  direction,
  id,
  type,
}: {
  direction: Direction;
  id?: string;
  type: "source" | "target";
}) {
  return (
    <Handle
      className="!size-1 !border-0 !bg-transparent !opacity-0"
      id={id ?? null}
      position={handlePosition(direction)}
      type={type}
    />
  );
}

function CoreNodeView({ data, selected }: NodeProps<CoreFlowNode>) {
  return (
    <div
      className={cn(
        "relative w-64 border bg-foreground px-6 py-5 text-background shadow-[0_24px_70px_rgb(48_35_102/22%)] transition-shadow",
        selected && "ring-2 ring-primary ring-offset-4 ring-offset-background",
      )}
    >
      {(["top", "right", "bottom", "left"] as const).map((direction) => (
        <HiddenHandle
          direction={direction}
          id={direction}
          key={direction}
          type="source"
        />
      ))}
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center bg-background/10">
          <BrandIcon className="size-7" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] tracking-[0.18em] text-background/55 uppercase">
            Context Layer
          </p>
          <p className="mt-0.5 truncate text-lg font-semibold tracking-[-0.035em]">
            Workspace MCP
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 border-y border-background/15 py-3">
        <div>
          <p className="text-xl font-semibold">{data.toolCount}</p>
          <p className="text-[0.625rem] tracking-wider text-background/55 uppercase">
            Tools exposed
          </p>
        </div>
        <div className="border-l border-background/15 pl-4">
          <p className="text-xl font-semibold">
            {data.usableProviderCount}
            <span className="text-sm text-background/45">
              /{data.totalProviderCount}
            </span>
          </p>
          <p className="text-[0.625rem] tracking-wider text-background/55 uppercase">
            Providers ready
          </p>
        </div>
      </div>
      <p className="mt-3 truncate text-xs text-background/60">
        {data.scopeLabel}
      </p>
    </div>
  );
}

function ProviderNodeView({ data, selected }: NodeProps<ProviderFlowNode>) {
  const { provider } = data;
  const ready = provider.readiness === "ready";

  return (
    <div
      className={cn(
        "group/provider relative w-60 border bg-card px-4 py-3.5 shadow-[0_14px_38px_rgb(35_28_70/10%)] transition-[border-color,box-shadow,opacity]",
        ready
          ? "border-primary/35 hover:border-primary/60 hover:shadow-[0_18px_46px_rgb(63_43_145/16%)]"
          : "border-dashed border-border bg-muted/75 text-muted-foreground",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <HiddenHandle direction={opposite(data.direction)} type="target" />
      <HiddenHandle direction={data.direction} type="source" />
      <div className="flex items-center gap-3">
        <ProviderMark
          className={cn(!ready && "grayscale opacity-60")}
          displayName={provider.displayName}
          provider={provider.provider}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {provider.displayName}
          </p>
          <p className="mt-1 font-mono text-[0.625rem] tracking-wide text-muted-foreground uppercase">
            {ready
              ? `${String(provider.tools.length)} tools exposed`
              : "Dormant"}
          </p>
        </div>
        {ready ? (
          <CaretDownIcon
            aria-hidden="true"
            className={cn(
              "size-4 text-primary transition-transform",
              data.expanded && "rotate-180",
            )}
          />
        ) : (
          <WarningCircleIcon aria-hidden="true" className="size-4" />
        )}
      </div>
    </div>
  );
}

function ToolNodeView({ data, selected }: NodeProps<ToolFlowNode>) {
  const write = data.tool.kind === "write";

  return (
    <div
      className={cn(
        "relative w-56 border bg-card px-3.5 py-3 shadow-[0_10px_28px_rgb(35_28_70/8%)] transition-[border-color,box-shadow]",
        write
          ? "border-amber-500/45 hover:border-amber-500/75"
          : "border-border hover:border-primary/50",
        selected &&
          (write
            ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-background"
            : "ring-2 ring-primary ring-offset-2 ring-offset-background"),
      )}
    >
      <HiddenHandle direction={opposite(data.direction)} type="target" />
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center",
            write
              ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
              : "bg-primary/10 text-primary",
          )}
        >
          <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p
            className="truncate text-xs font-semibold"
            title={data.tool.displayName}
          >
            {data.tool.displayName}
          </p>
          <p className="mt-1 truncate font-mono text-[0.6rem] text-muted-foreground">
            {data.tool.name}
          </p>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  core: CoreNodeView,
  provider: ProviderNodeView,
  tool: ToolNodeView,
} satisfies NodeTypes;

function toolPosition(
  providerPosition: { x: number; y: number },
  direction: Direction,
  index: number,
  count: number,
): { x: number; y: number } {
  const perLane = 6;
  const lane = Math.floor(index / perLane);
  const laneIndex = index % perLane;
  const laneCount = Math.min(perLane, count - lane * perLane);
  const centered = laneIndex - (laneCount - 1) / 2;

  if (direction === "left" || direction === "right") {
    const sign = direction === "right" ? 1 : -1;
    return {
      x: providerPosition.x + sign * (300 + lane * 265),
      y: providerPosition.y + centered * 92,
    };
  }

  const sign = direction === "bottom" ? 1 : -1;
  return {
    x: providerPosition.x + centered * 240,
    y: providerPosition.y + sign * (225 + lane * 120),
  };
}

function matchesTool(tool: McpInspectorTool, query: string): boolean {
  return [tool.displayName, tool.name, tool.description].some((value) =>
    value.toLocaleLowerCase().includes(query),
  );
}

function matchesProvider(
  provider: McpInspectorProvider,
  query: string,
): boolean {
  return [provider.displayName, provider.provider].some((value) =>
    value.toLocaleLowerCase().includes(query),
  );
}

function createGraph({
  expandedProviders,
  providers,
  query,
  scopeLabel,
  scopeProviders,
}: {
  expandedProviders: ReadonlySet<string>;
  providers: readonly McpInspectorProvider[];
  query: string;
  scopeLabel: string;
  scopeProviders: readonly McpInspectorProvider[];
}): { edges: Edge[]; nodes: InspectorFlowNode[] } {
  const usableProviderCount = scopeProviders.filter(
    (provider) => provider.readiness === "ready",
  ).length;
  const toolCount = scopeProviders.reduce(
    (total, provider) => total + provider.tools.length,
    0,
  );
  const nodes: InspectorFlowNode[] = [
    {
      ariaLabel: `Workspace MCP. ${String(toolCount)} tools exposed by ${String(usableProviderCount)} of ${String(scopeProviders.length)} providers.`,
      ariaRole: "group",
      data: {
        scopeLabel,
        toolCount,
        totalProviderCount: scopeProviders.length,
        usableProviderCount,
      },
      draggable: true,
      id: "core",
      position: { x: 0, y: 0 },
      type: "core",
    },
  ];
  const edges: Edge[] = [];

  providers.forEach((provider, index) => {
    const angle =
      -Math.PI / 2 + (index * Math.PI * 2) / Math.max(providers.length, 1);
    const direction = directionForAngle(angle);
    const position = {
      x: Math.cos(angle) * PROVIDER_RADIUS_X,
      y: Math.sin(angle) * PROVIDER_RADIUS_Y,
    };
    const providerId = `provider:${provider.provider}`;
    const providerMatch = query !== "" && matchesProvider(provider, query);
    const matchingTools = provider.tools.filter((tool) =>
      matchesTool(tool, query),
    );
    const toolsToShow =
      query === ""
        ? expandedProviders.has(provider.provider)
          ? provider.tools
          : []
        : providerMatch
          ? provider.tools
          : matchingTools;

    nodes.push({
      ariaLabel: `${provider.displayName}. ${provider.readiness === "ready" ? `${String(provider.tools.length)} tools exposed. Activate to expand or collapse tools.` : (provider.readinessReason ?? "Provider unavailable.")}`,
      ariaRole: "button",
      data: {
        direction,
        expanded: toolsToShow.length > 0,
        provider,
      },
      draggable: true,
      id: providerId,
      position,
      type: "provider",
    });
    edges.push({
      animated: provider.readiness === "ready",
      id: `core:${provider.provider}`,
      source: "core",
      sourceHandle: direction,
      style: {
        opacity: provider.readiness === "ready" ? 0.68 : 0.32,
        stroke:
          provider.readiness === "ready"
            ? "var(--primary)"
            : "var(--muted-foreground)",
        strokeDasharray: provider.readiness === "ready" ? undefined : "5 6",
        strokeWidth: 1.35,
      },
      target: providerId,
    });

    toolsToShow.forEach((tool, toolIndex) => {
      const toolId = `tool:${provider.provider}:${tool.name}`;
      nodes.push({
        ariaLabel: `${tool.displayName}, ${tool.kind} tool from ${provider.displayName}.`,
        ariaRole: "button",
        data: {
          direction,
          providerDisplayName: provider.displayName,
          providerKey: provider.provider,
          tool,
        },
        draggable: true,
        id: toolId,
        position: toolPosition(
          position,
          direction,
          toolIndex,
          toolsToShow.length,
        ),
        type: "tool",
      });
      edges.push({
        id: `${providerId}:${tool.name}`,
        source: providerId,
        style: {
          opacity: 0.48,
          stroke: tool.kind === "write" ? "rgb(217 119 6)" : "var(--primary)",
          strokeWidth: 1,
        },
        target: toolId,
      });
    });
  });

  return { edges, nodes };
}

function SelectionDetails({
  onClose,
  providers,
  selection,
}: {
  onClose: () => void;
  providers: readonly McpInspectorProvider[];
  selection: InspectorSelection;
}) {
  const provider = providers.find(
    (candidate) => candidate.provider === selection.provider,
  );
  if (provider === undefined) return null;

  const tool =
    selection.type === "tool"
      ? provider.tools.find((candidate) => candidate.name === selection.tool)
      : undefined;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderMark
            displayName={provider.displayName}
            provider={provider.provider}
            size="sm"
          />
          <div className="min-w-0">
            <p className="font-mono text-[0.625rem] tracking-wider text-muted-foreground uppercase">
              {tool === undefined ? "Provider" : "MCP tool"}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">
              {tool?.displayName ?? provider.displayName}
            </h2>
          </div>
        </div>
        <Button
          aria-label="Close inspector"
          onClick={onClose}
          size="icon-xs"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      {tool === undefined ? (
        <div className="space-y-6 p-5">
          <div>
            <Badge
              className={cn(
                provider.readiness === "ready" &&
                  "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
              variant={provider.readiness === "ready" ? "secondary" : "outline"}
            >
              {provider.readiness === "ready" ? "Ready" : provider.readiness}
            </Badge>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {provider.readinessReason ??
                `${provider.displayName} is ready for your workspace MCP.`}
            </p>
          </div>
          <dl className="grid grid-cols-2 border-y border-border">
            <div className="py-4">
              <dt className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Exposed
              </dt>
              <dd className="mt-1 text-2xl font-semibold">
                {provider.tools.length}
              </dd>
            </div>
            <div className="border-l border-border py-4 pl-5">
              <dt className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Enabled
              </dt>
              <dd className="mt-1 text-2xl font-semibold">
                {provider.configuredToolCount}
              </dd>
            </div>
          </dl>
          <Button asChild className="w-full" variant="outline">
            <Link href={`/integrations/${provider.provider}`}>
              View integration
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6 p-5">
          <Badge
            className={cn(
              tool.kind === "write" &&
                "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
            variant="secondary"
          >
            {tool.kind}
          </Badge>
          <div>
            <p className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Exact tool name
            </p>
            <code className="mt-2 block overflow-x-auto border border-border bg-muted/70 p-3 text-xs">
              {tool.name}
            </code>
          </div>
          <div>
            <p className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              What it does
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {tool.description}
            </p>
          </div>
          <div className="border-t border-border pt-4 text-xs text-muted-foreground">
            Exposed through {provider.displayName} for your signed-in member.
          </div>
        </div>
      )}
    </div>
  );
}

function GraphEmptyState({
  hasProviders,
  query,
  selectedBundle,
}: {
  hasProviders: boolean;
  query: string;
  selectedBundle: McpInspectorBundle | null;
}) {
  const noSearchResults = query !== "";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/72 p-6 backdrop-blur-[2px]">
      <Empty className="max-w-lg border border-dashed border-border bg-background/90">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {noSearchResults ? (
              <MagnifyingGlassIcon aria-hidden="true" />
            ) : (
              <PlugsConnectedIcon aria-hidden="true" />
            )}
          </EmptyMedia>
          <EmptyTitle>
            {noSearchResults
              ? "No matching MCP tools"
              : hasProviders
                ? "No MCP providers in this bundle"
                : "No MCP providers installed"}
          </EmptyTitle>
          <EmptyDescription>
            {noSearchResults
              ? "Try a provider name, display name, exact MCP tool name, or description."
              : hasProviders
                ? `${selectedBundle?.name ?? "This bundle"} does not include any installed context providers.`
                : "Install a context provider to start mapping your workspace MCP."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function InspectorCanvas({ data }: { data: McpInspectorData }) {
  const isMobile = useIsMobile();
  const { fitView } = useReactFlow<InspectorFlowNode>();
  const [bundleId, setBundleId] = useState(ALL_PROVIDERS);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    () => new Set(),
  );
  const [queryInput, setQueryInput] = useState("");
  const query = queryInput.trim().toLocaleLowerCase();
  const [selection, setSelection] = useState<InspectorSelection | null>(null);
  const selectedBundle =
    data.bundles.find((bundle) => bundle.id === bundleId) ?? null;
  const scopeProviders = useMemo(() => {
    if (selectedBundle === null) return data.providers;
    const bundleProviders = new Set(selectedBundle.providers);
    return data.providers.filter((provider) =>
      bundleProviders.has(provider.provider),
    );
  }, [data.providers, selectedBundle]);
  const visibleProviders = useMemo(() => {
    if (query === "") return scopeProviders;
    return scopeProviders.filter(
      (provider) =>
        matchesProvider(provider, query) ||
        provider.tools.some((tool) => matchesTool(tool, query)),
    );
  }, [query, scopeProviders]);
  const scopeLabel = selectedBundle?.name ?? "All providers";
  const graph = useMemo(
    () =>
      createGraph({
        expandedProviders,
        providers: visibleProviders,
        query,
        scopeLabel,
        scopeProviders,
      }),
    [expandedProviders, query, scopeLabel, scopeProviders, visibleProviders],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<InspectorFlowNode>(
    graph.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes((current) => {
      const currentPositions = new Map(
        current.map((node) => [node.id, node.position]),
      );
      return graph.nodes.map((node) => ({
        ...node,
        position: currentPositions.get(node.id) ?? node.position,
      }));
    });
    setEdges(graph.edges);
    const frame = window.requestAnimationFrame(() => {
      void fitView({ duration: 420, maxZoom: 1, padding: 0.2 });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [fitView, graph, setEdges, setNodes]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: InspectorFlowNode) => {
      if (node.type === "provider") {
        const provider = node.data.provider;
        setSelection({ provider: provider.provider, type: "provider" });
        if (provider.readiness === "ready") {
          setExpandedProviders((current) => {
            const next = new Set(current);
            if (next.has(provider.provider)) next.delete(provider.provider);
            else next.add(provider.provider);
            return next;
          });
        }
      } else if (node.type === "tool") {
        setSelection({
          provider: node.data.providerKey,
          tool: node.data.tool.name,
          type: "tool",
        });
      }
    },
    [],
  );

  const exposedToolCount = scopeProviders.reduce(
    (total, provider) => total + provider.tools.length,
    0,
  );
  const writeToolCount = scopeProviders.reduce(
    (total, provider) =>
      total + provider.tools.filter((tool) => tool.kind === "write").length,
    0,
  );
  const readyProviderCount = scopeProviders.filter(
    (provider) => provider.readiness === "ready",
  ).length;
  const showEmpty = visibleProviders.length === 0;
  const selectionDetails =
    selection === null ? null : (
      <SelectionDetails
        onClose={() => {
          setSelection(null);
        }}
        providers={data.providers}
        selection={selection}
      />
    );

  return (
    <section className="mt-9" aria-label="MCP inspector">
      <div className="grid gap-3 border border-border bg-card p-3 md:grid-cols-[minmax(15rem,0.75fr)_minmax(18rem,1.25fr)_auto] md:items-center">
        <Select
          onValueChange={(value) => {
            setBundleId(value);
            setSelection(null);
          }}
          value={bundleId}
        >
          <SelectTrigger
            className="w-full border border-border bg-background"
            aria-label="MCP scope"
          >
            <SelectValue placeholder="Choose an MCP scope" />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            <SelectItem value={ALL_PROVIDERS}>All providers</SelectItem>
            {data.bundles.map((bundle) => (
              <SelectItem key={bundle.id} value={bundle.id}>
                {bundle.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <InputGroup className="border border-border bg-background">
          <InputGroupAddon className="pl-3">
            <MagnifyingGlassIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search MCP tools"
            onChange={(event) => {
              setQueryInput(event.target.value);
              setSelection(null);
            }}
            placeholder="Search providers, tools, or capabilities…"
            value={queryInput}
          />
          {queryInput === "" ? null : (
            <InputGroupAddon align="inline-end" className="pr-2">
              <InputGroupButton
                aria-label="Clear search"
                onClick={() => {
                  setQueryInput("");
                  setSelection(null);
                }}
                size="icon-xs"
              >
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground md:justify-end">
          <span className="flex items-center gap-1.5">
            <CheckCircleIcon
              className="size-3.5 text-emerald-600"
              weight="fill"
            />
            {readyProviderCount}/{scopeProviders.length} ready
          </span>
          <span>{exposedToolCount} tools</span>
          <span className="text-amber-700 dark:text-amber-300">
            {writeToolCount} write
          </span>
        </div>
      </div>

      <div className="mcp-inspector-canvas relative h-[min(760px,calc(100svh-14rem))] min-h-[560px] overflow-hidden border-x border-b border-border bg-background">
        <ReactFlow<InspectorFlowNode>
          ariaLabelConfig={{
            "controls.ariaLabel": "MCP graph controls",
            "controls.fitView.ariaLabel": "Fit MCP graph to view",
            "controls.zoomIn.ariaLabel": "Zoom in on MCP graph",
            "controls.zoomOut.ariaLabel": "Zoom out of MCP graph",
            "node.a11yDescription.default":
              "Press Enter or Space to select. Use arrow keys to reposition this node.",
          }}
          deleteKeyCode={null}
          edges={edges}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          maxZoom={1.6}
          minZoom={0.18}
          nodeOrigin={[0.5, 0.5]}
          nodes={nodes}
          nodesConnectable={false}
          nodeTypes={nodeTypes}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange}
          onPaneClick={() => {
            setSelection(null);
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            color="color-mix(in oklch, var(--primary) 24%, transparent)"
            gap={28}
            size={1.25}
            variant={BackgroundVariant.Dots}
          />
          <Controls
            className="!rounded-none !border !border-border !bg-card !shadow-sm [&>button]:!rounded-none [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-foreground [&>button:hover]:!bg-muted"
            fitViewOptions={{ duration: 420, maxZoom: 1, padding: 0.2 }}
            showInteractive={false}
          />
        </ReactFlow>

        <div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2 border border-border/80 bg-background/85 px-3 py-2 text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase backdrop-blur">
          <ArrowsOutIcon aria-hidden="true" className="size-3" />
          Drag to explore · select a provider to expand
        </div>

        {showEmpty ? (
          <GraphEmptyState
            hasProviders={data.providers.length > 0}
            query={query}
            selectedBundle={selectedBundle}
          />
        ) : null}

        {selectionDetails === null || isMobile ? null : (
          <aside className="absolute inset-y-4 right-4 z-20 w-80 border border-border bg-card/96 shadow-xl backdrop-blur-xl">
            {selectionDetails}
          </aside>
        )}
      </div>

      <Sheet
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
        open={isMobile && selection !== null}
      >
        <SheetContent
          className="max-h-[82svh]"
          side="bottom"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>MCP inspector details</SheetTitle>
            <SheetDescription>
              Read-only details for the selected MCP provider or tool.
            </SheetDescription>
          </SheetHeader>
          {selectionDetails}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function McpInspectorGraph({ data }: { data: McpInspectorData }) {
  return (
    <ReactFlowProvider>
      <InspectorCanvas data={data} />
    </ReactFlowProvider>
  );
}
