"use client";

import {
  BuildingsIcon,
  HouseIcon,
  KeyIcon,
  PackageIcon,
  PlugsConnectedIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { BrandIcon } from "@/components/brand-icon";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navigation = [
  { href: "/dashboard", icon: HouseIcon, label: "Overview" },
  {
    href: "/integrations",
    icon: PlugsConnectedIcon,
    label: "Integrations",
  },
  { href: "/members", icon: UsersThreeIcon, label: "Members" },
  { href: "/agent-setup", icon: KeyIcon, label: "Agent Setup" },
  { href: "/bundles", icon: PackageIcon, label: "Bundles" },
] as const;

function WorkspaceBreadcrumbs() {
  const pathname = usePathname();
  const provider = /^\/integrations\/([^/]+)/.exec(pathname)?.[1];
  const bundleId = /^\/bundles\/([^/]+)/.exec(pathname)?.[1];

  if (provider !== undefined) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/integrations">Integrations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">{provider}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (bundleId !== undefined) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/bundles">Bundles</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Bundle details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>
            {pathname.startsWith("/integrations")
              ? "Integrations"
              : pathname.startsWith("/agent-setup")
                ? "Agent Setup"
                : pathname.startsWith("/bundles")
                  ? "Bundles"
                  : pathname.startsWith("/members")
                    ? "Members"
                    : "Overview"}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function WorkspaceNavigation() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  function closeMobileNavigation() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <SidebarMenu className="gap-1">
      {navigation.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              className="relative h-10 px-3 text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:absolute data-[active=true]:before:inset-y-0 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:bg-primary"
              isActive={active}
              tooltip={item.label}
            >
              <Link
                aria-current={active ? "page" : undefined}
                href={item.href}
                onClick={closeMobileNavigation}
              >
                <Icon aria-hidden="true" weight={active ? "fill" : "regular"} />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function WorkspaceShell({
  children,
  defaultSidebarOpen,
  workspaceName,
  workspaceRole,
}: {
  children: ReactNode;
  defaultSidebarOpen: boolean;
  workspaceName: string;
  workspaceRole: "member" | "owner" | null;
}) {
  return (
    <SidebarProvider
      defaultOpen={defaultSidebarOpen}
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/70 px-2 py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="h-12 px-3 hover:bg-transparent hover:text-sidebar-foreground"
                size="lg"
                tooltip="Context Layer"
              >
                <Link href="/">
                  <BrandIcon className="size-8 shrink-0" />
                  <span className="font-heading text-sm font-semibold tracking-[-0.025em]">
                    Context Layer
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-2 pt-4">
            <div
              className="mb-5 flex h-14 min-w-0 items-center gap-3 border border-sidebar-border/75 bg-background/55 px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0"
              title={`${workspaceName}${workspaceRole === null ? "" : ` · ${workspaceRole}`}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center bg-sidebar-accent text-sidebar-accent-foreground">
                <BuildingsIcon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-sm font-semibold">
                  {workspaceName}
                </span>
                <span className="mt-0.5 block text-[0.625rem] font-medium tracking-wider text-sidebar-foreground/55 uppercase">
                  {workspaceRole ?? "Workspace"}
                </span>
              </span>
            </div>
            <SidebarGroupContent>
              <WorkspaceNavigation />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border/70 p-2">
          <SignOutForm appearance="sidebar" />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="workspace-canvas">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/70 bg-background/85 px-5 backdrop-blur-xl md:px-7">
          <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground" />
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <WorkspaceBreadcrumbs />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
