import { Store } from "lucide-react";

import { requirePermission } from "@/core/auth/session";
import { getVisibleResellers } from "@/modules/stock/reseller-scope";
import { prisma } from "@/lib/prisma";
import { ResellersTable } from "@/modules/resellers/components/resellers-table";

const RESELLERS_VIEWALL = "resellers.viewall";

export default async function OdberatelePage() {
  const user = await requirePermission("resellers.view");

  // RBAC scope (stejný princip jako stock/analytics) — zástupce jen své.
  const scoped = await getVisibleResellers(user, RESELLERS_VIEWALL);
  const resellers = await prisma.reseller.findMany({
    where: { id: { in: scoped.map((r) => r.id) } },
    select: {
      id: true,
      domena: true,
      nazev: true,
      jeVlastni: true,
      feedUrl: true,
      feedFormat: true,
      feedRefreshedAt: true,
      feedItems: true,
    },
    orderBy: { domena: "asc" },
  });

  const rows = resellers.map((r) => ({
    ...r,
    feedRefreshedAt: r.feedRefreshedAt?.toISOString() ?? null,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
          <Store className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Odběratelé</h1>
          <p className="text-[var(--muted-foreground)]">
            Správa odběratelů a jejich feedů dostupnosti.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-6 text-sm text-[var(--muted-foreground)]">
          Nemáte přiřazené žádné odběratele. Obraťte se na administrátora.
        </p>
      ) : (
        <ResellersTable rows={rows} />
      )}
    </div>
  );
}
