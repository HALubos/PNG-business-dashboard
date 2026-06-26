import {
  PackageSearch,
  FileSpreadsheet,
  FileDown,
  Database,
  Info,
  ChevronRight,
  RotateCw,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import {
  categorizeResellerProducts,
  getActiveSnapshot,
  getStockConfig,
  listResellersForUser,
  canViewReseller,
  type ResellerProductBuckets,
} from "@/modules/stock/opportunities";
import { ResellerPicker } from "@/modules/stock/components/reseller-picker";
import { OpportunitiesTable } from "@/modules/stock/components/opportunities-table";
import { ImportCard } from "@/modules/stock/components/import-card";
import { SettingsCard } from "@/modules/stock/components/settings-card";
import { FeedStatusCard } from "@/modules/stock/components/feed-status-card";

export default async function SkladovostPage({
  searchParams,
}: {
  searchParams: Promise<{ reseller?: string }>;
}) {
  const user = await requirePermission("stock.view");
  const { reseller: resellerParam } = await searchParams;

  const [snapshot, config, resellers] = await Promise.all([
    getActiveSnapshot(),
    getStockConfig(),
    listResellersForUser(user),
  ]);

  const canEdit = can(user, "stock.edit");
  const canAdmin = can(user, "stock.admin");
  const canExport = can(user, "stock.export");

  // Ověření scope na backendu: zástupce si nevybere cizího odběratele.
  let selectedId: string | null = null;
  if (resellerParam && (await canViewReseller(user, resellerParam))) {
    selectedId = resellerParam;
  }

  const buckets: ResellerProductBuckets =
    snapshot && selectedId
      ? await categorizeResellerProducts(snapshot.id, selectedId, config)
      : { opportunities: [], resellerHas: [], weOut: [] };
  const opportunities = buckets.opportunities;
  const restockCount = buckets.weOut.filter((r) => r.isRestockCandidate).length;
  const selectedReseller = resellers.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hlavička */}
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
          <PackageSearch className="size-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Kontrola skladovosti</h1>
          <p className="text-[var(--muted-foreground)]">
            Produkty, které odběratel vyprodal, ale my je máme skladem.
          </p>
        </div>
      </div>

      {/* Souhrn snapshotu */}
      {snapshot ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Database className="size-4 text-[var(--muted-foreground)]" />
            Aktivní data:
            <strong>
              {new Date(snapshot.datumExportu).toLocaleDateString("cs-CZ", {
                timeZone: "UTC",
              })}
            </strong>
          </span>
          <span className="text-[var(--muted-foreground)]">
            {snapshot.nazevSouboru}
          </span>
          <span className="text-[var(--muted-foreground)]">
            {snapshot.pocetProduktu} produktů · {snapshot.pocetOdberatelu}{" "}
            odběratelů
          </span>
        </div>
      ) : null}

      {/* Stav živé skladovosti z feedu + tlačítko aktualizace */}
      <FeedStatusCard
        refreshedAt={config.feedRefreshedAt?.toISOString() ?? null}
        items={config.feedItems}
        canRefresh={canEdit}
      />

      {/* Import (jen stock.edit) */}
      {canEdit ? <ImportCard /> : null}

      {/* Nastavení (jen stock.admin) */}
      {canAdmin ? (
        <SettingsCard
          availableStates={config.availableStates}
          stockThreshold={config.stockThreshold}
        />
      ) : null}

      {/* Bez dat */}
      {!snapshot ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-[var(--muted-foreground)]">
            <Info className="size-5 shrink-0" />
            <p>
              Zatím nejsou nahraná žádná data.{" "}
              {canEdit
                ? "Nahrajte Price Check XLSX výše."
                : "Požádejte administrátora o import Price Check exportu."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Výběr odběratele</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {resellers.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nemáte přiřazené žádné odběratele. Obraťte se na administrátora.
              </p>
            ) : (
              <ResellerPicker resellers={resellers} selectedId={selectedId} />
            )}

            {selectedReseller ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="default">{selectedReseller.domena}</Badge>
                    <span>
                      <strong>{opportunities.length}</strong> příležitostí k
                      nabídce
                    </span>
                  </div>
                  {canExport && opportunities.length > 0 ? (
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/api/stock/export?reseller=${selectedReseller.id}&format=xlsx`}
                        >
                          <FileSpreadsheet /> Export XLSX
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/api/stock/export?reseller=${selectedReseller.id}&format=csv`}
                        >
                          <FileDown /> CSV
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>

                {/* Blok 1 — příležitosti (akční seznam) */}
                {opportunities.length > 0 ? (
                  <OpportunitiesTable rows={opportunities} />
                ) : (
                  <p className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
                    Pro tohoto odběratele nejsou žádné příležitosti — vše, co
                    máme skladem, má i on dostupné.
                  </p>
                )}

                {/* Blok 2 — odběratel už má od nás skladem (kontext, sbalené) */}
                {buckets.resellerHas.length > 0 ? (
                  <details className="group rounded-lg border border-[var(--border)]">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">
                      <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                      Odběratel už má od nás skladem ({buckets.resellerHas.length}
                      )
                    </summary>
                    <div className="border-t border-[var(--border)] p-4">
                      <OpportunitiesTable rows={buckets.resellerHas} muted />
                    </div>
                  </details>
                ) : null}

                {/* Blok 3 — vyprodáno u nás (vč. restock kandidátů, sbalené) */}
                {buckets.weOut.length > 0 ? (
                  <details className="group rounded-lg border border-[var(--border)]">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">
                      <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                      Vyprodáno u nás ({buckets.weOut.length})
                      {restockCount > 0 ? (
                        <span className="ml-1 inline-flex items-center gap-1 text-[var(--foreground)]">
                          <RotateCw className="size-3.5" />
                          {restockCount} restock kandidátů
                        </span>
                      ) : null}
                    </summary>
                    <div className="border-t border-[var(--border)] p-4">
                      <OpportunitiesTable rows={buckets.weOut} muted showRestock />
                    </div>
                  </details>
                ) : null}
              </div>
            ) : resellers.length > 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Vyberte odběratele a zobrazí se tabulka příležitostí.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
