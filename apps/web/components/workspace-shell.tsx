"use client";

import {
  HouseIcon,
  PlugsConnectedIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutForm } from "@/components/auth/sign-out-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
            {pathname.startsWith("/integrations") ? "Integrations" : "Overview"}
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
            <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
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
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Context Layer">
                <Link href="/">
                  <span className="flex size-8 items-center justify-center bg-primary text-xs font-semibold text-primary-foreground">
                    CL
                  </span>
                  <span className="font-heading text-sm font-semibold tracking-wider uppercase">
                    Context Layer
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="truncate">
              {workspaceName}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <WorkspaceNavigation />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <p className="px-2 text-xs leading-relaxed text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
            Context follows your work, not the other way around.
          </p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger />
          <WorkspaceBreadcrumbs />
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Open account menu"
                  size="icon-sm"
                  variant="ghost"
                >
                  <Avatar size="sm">
                    <AvatarFallback>
                      <UserCircleIcon aria-hidden="true" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8}>
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="p-1">
                  <SignOutForm />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
