"use client";

import {
  CirclesFourIcon,
  HouseIcon,
  PlugsConnectedIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutForm } from "@/components/auth/sign-out-form";
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigation = [
  { href: "/dashboard", icon: HouseIcon, label: "Overview" },
  {
    href: "/integrations",
    icon: PlugsConnectedIcon,
    label: "Integrations",
  },
  { href: "/members", icon: UsersThreeIcon, label: "Members" },
] as const;

function WorkspaceBreadcrumbs() {
  const pathname = usePathname();
  const provider = /^\/integrations\/([^/]+)/.exec(pathname)?.[1];

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

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>
            {pathname.startsWith("/integrations")
              ? "Integrations"
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

  return (
    <SidebarMenu>
      {navigation.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              className="relative h-10 rounded-none border border-transparent px-3 data-[active=true]:border-sidebar-border data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:before:absolute data-[active=true]:before:inset-y-0 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:bg-primary"
              isActive={active}
              tooltip={item.label}
            >
              <Link aria-current={active ? "page" : undefined} href={item.href}>
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
}: {
  children: ReactNode;
  defaultSidebarOpen: boolean;
  workspaceName: string;
}) {
  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Context Layer">
                <Link href="/">
                  <span className="relative flex size-9 items-center justify-center bg-foreground text-background">
                    <CirclesFourIcon
                      aria-hidden="true"
                      className="size-5"
                      weight="fill"
                    />
                    <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar bg-primary" />
                  </span>
                  <span className="font-heading text-sm font-semibold tracking-[-0.025em]">
                    Context layer
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pt-5">
            <SidebarGroupLabel className="mb-2 truncate text-[0.6875rem] tracking-wide">
              {workspaceName}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <WorkspaceNavigation />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="p-1">
            <SignOutForm />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="workspace-canvas">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 bg-background/78 px-4 backdrop-blur-xl md:px-7">
          <SidebarTrigger />
          <WorkspaceBreadcrumbs />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
