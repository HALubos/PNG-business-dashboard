import { Plug } from "lucide-react";

import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/lib/prisma";
import { getVisibleProjects } from "@/core/projects/project-scope";
import { allConnectorAdapters } from "@/core/connectors/registry";
import { backfillFrom } from "@/core/connectors/sync";
import {
  IntegraceCatalog,
  type CatalogCard,
} from "@/components/integrace/integrace-catalog";

const PROJECTS_VIEWALL = "admin.projects";

export default async function IntegracePage({
  searchParams,
}: {
  searchParams: Promise<{ projekt?: string }>;
}) {
  const user = await requirePermission("admin.connectors");
  const { projekt } = await searchParams;

  const projects = await getVisibleProjects(user, PROJECTS_VIEWALL);

  // Vybraný projekt (dle ?projekt=klic), jinak první.
  const selected =
    projects.find((p) => p.klic === projekt) ?? projects[0] ?? null;

  const connectors = selected
    ? await prisma.connector.findMany({
        where: { projectId: selected.id },
        select: {
          id: true,
          type: true,
          syncStatus: true,
          lastSyncAt: true,
          lastError: true,
          feedUrl: true,
          active: true,
        },
      })
    : [];
  const byType = new Map(connectors.map((c) => [c.type, c]));

  // Katalog karet z REGISTRU adaptérů (nový adaptér = nová karta automaticky).
  const cards: CatalogCard[] = allConnectorAdapters().map((a) => {
    const c = byType.get(a.type);
    return {
      type: a.type,
      kind: a.kind,
      nazev: a.nazev,
      popis: a.popis,
      icon: a.icon,
      category: a.category,
      overridesRevenue: a.overridesRevenue ?? false,
      comingSoon: a.comingSoon ?? false,
      connector: c
        ? {
            id: c.id,
            syncStatus: c.syncStatus,
            lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
            lastError: c.lastError,
            feedUrl: c.feedUrl,
            active: c.active,
          }
        : null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
          <Plug className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Integrace</h1>
          <p className="text-[var(--muted-foreground)]">
            Připojte zdroje dat (reklama, analytika, e-shop) ke svým projektům.
          </p>
        </div>
      </div>

      {selected ? (
        <IntegraceCatalog
          projects={projects}
          selectedKlic={selected.klic}
          selectedProjectId={selected.id}
          cards={cards}
          backfillFrom={backfillFrom().toLocaleDateString("cs-CZ")}
        />
      ) : (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-6 text-sm text-[var(--muted-foreground)]">
          Žádné projekty. Spusťte seed (`npm run db:seed`).
        </p>
      )}
    </div>
  );
}
