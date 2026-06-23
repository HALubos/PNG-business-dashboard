import Link from "next/link";
import {
  PackageSearch,
  Settings,
  BarChart3,
  Store,
  ArrowRight,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/core/auth/session";
import { modulesForPermissions } from "@/core/modules/registry";
import { can } from "@/core/rbac/access";

const TILE_ICONS: Record<string, LucideIcon> = {
  PackageSearch,
  Settings,
  BarChart3,
  Store,
};

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ forbidden?: string }>;
}) {
  const user = await requireUser();
  const { forbidden } = await searchParams;

  const modules = modulesForPermissions(user.permissions);
  const showAdmin = can(user, "admin.view");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Vítejte, {user.jmeno.split(" ")[0]}.
        </h1>
        <p className="text-[var(--muted-foreground)]">
          Role: <Badge variant="secondary">{user.roleName}</Badge>{" "}
          — níže jsou moduly, na které máte právo.
        </p>
      </div>

      {forbidden ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm text-[var(--destructive)]">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Nedostatečné oprávnění</p>
            <p>
              Na požadovanou stránku nemáte právo ({forbidden}). Obraťte se na
              administrátora.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Icon = TILE_ICONS[m.icon] ?? PackageSearch;
          return (
            <Link key={m.key} href={m.nav.href} className="group">
              <Card className="h-full transition-colors group-hover:border-[var(--primary)]">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle className="flex items-center justify-between">
                    {m.nazev}
                    <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardTitle>
                  <CardDescription>{m.popis}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}

        {showAdmin ? (
          <Link href="/admin" className="group">
            <Card className="h-full transition-colors group-hover:border-[var(--primary)]">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
                  <Settings className="size-5" />
                </div>
                <CardTitle className="flex items-center justify-between">
                  Administrace
                  <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </CardTitle>
                <CardDescription>
                  Správa uživatelů, rolí, modulů a auditní log.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : null}

        {modules.length === 0 && !showAdmin ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Zatím nemáte přístup k žádnému modulu.
          </p>
        ) : null}
      </div>
    </div>
  );
}
