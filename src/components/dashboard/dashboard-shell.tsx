"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackageSearch,
  Settings,
  Menu,
  LogOut,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NavItem, NavUser } from "./nav";
import { logoutAction } from "@/app/(dashboard)/logout-action";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  PackageSearch,
  Settings,
};

function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? LayoutDashboard;
}

function initials(jmeno: string): string {
  return jmeno
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = iconFor(item.icon);
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--foreground)] hover:bg-[var(--accent)]",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-1 py-2">
      <div className="flex size-8 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]">
        <LayoutDashboard className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Obchodní dashboard</p>
        <p className="text-xs text-[var(--muted-foreground)]">ACTIVENT365</p>
      </div>
    </div>
  );
}

export function DashboardShell({
  user,
  navItems,
  children,
}: {
  user: NavUser;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--card)] p-3 md:flex md:flex-col">
        <Brand />
        <div className="mt-4">
          <NavLinks items={navItems} pathname={pathname} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--background)] px-3 md:px-6">
          {/* Mobilní menu */}
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetTitle className="sr-only">Navigace</SheetTitle>
                <Brand />
                <div className="mt-4">
                  <NavLinks
                    items={navItems}
                    pathname={pathname}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold">Dashboard</span>
          </div>

          <div className="hidden md:block" />

          {/* Uživatel */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-[var(--secondary)] text-xs font-semibold text-[var(--secondary-foreground)]">
                  {initials(user.jmeno)}
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-sm font-medium">
                    {user.jmeno}
                  </span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    {user.roleName}
                  </span>
                </span>
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="leading-tight">
                  <div>{user.jmeno}</div>
                  <div className="text-xs font-normal text-[var(--muted-foreground)]">
                    {user.email}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <button type="submit" className="w-full">
                  <DropdownMenuItem className="text-[var(--destructive)]">
                    <LogOut className="size-4" />
                    Odhlásit se
                  </DropdownMenuItem>
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
