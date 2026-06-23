import { requireUser } from "@/core/auth/session";
import { modulesForPermissions } from "@/core/modules/registry";
import { can } from "@/core/rbac/access";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { NavItem } from "@/components/dashboard/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Navigace se generuje z modulů, na které má uživatel právo.
  const navItems: NavItem[] = [
    { href: "/", label: "Přehled", icon: "LayoutDashboard" },
    ...modulesForPermissions(user.permissions).map((m) => ({
      href: m.nav.href,
      label: m.nav.label,
      icon: m.icon,
    })),
  ];

  if (can(user, "admin.view")) {
    navItems.push({
      href: "/admin",
      label: "Administrace",
      icon: "Settings",
    });
  }

  return (
    <DashboardShell
      user={{
        jmeno: user.jmeno,
        email: user.email,
        roleName: user.roleName,
      }}
      navItems={navItems}
    >
      {children}
    </DashboardShell>
  );
}
