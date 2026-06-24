import { requireUser } from "@/core/auth/session";
import { modulesByGroup } from "@/core/modules/registry";
import { GROUP_LABELS, GROUP_ORDER } from "@/core/modules/types";
import { can } from "@/core/rbac/access";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { NavGroup, NavItem } from "@/components/dashboard/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Navigace se generuje z modulů (rozdělených do skupin), na které má uživatel právo.
  const byGroup = modulesByGroup(user.permissions);

  const navGroups: NavGroup[] = [
    { label: null, items: [{ href: "/", label: "Přehled", icon: "LayoutDashboard" }] },
  ];

  for (const group of GROUP_ORDER) {
    const items: NavItem[] = (byGroup.get(group) ?? []).map((m) => ({
      href: m.nav.href,
      label: m.nav.label,
      icon: m.icon,
    }));
    // Integrace (katalog konektorů) = sdílená infra marketingu; do menu pod Marketing.
    if (group === "marketing" && can(user, "admin.connectors")) {
      items.push({ href: "/integrace", label: "Integrace", icon: "Plug" });
    }
    if (items.length > 0) {
      navGroups.push({ label: GROUP_LABELS[group], items });
    }
  }

  if (can(user, "admin.view")) {
    navGroups.push({
      label: null,
      items: [{ href: "/admin", label: "Administrace", icon: "Settings" }],
    });
  }

  return (
    <DashboardShell
      user={{
        jmeno: user.jmeno,
        email: user.email,
        roleName: user.roleName,
      }}
      navGroups={navGroups}
    >
      {children}
    </DashboardShell>
  );
}
