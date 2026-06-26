"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PERIODS, type PeriodKey } from "@/modules/mkt_ads/period";
import { TARGET_ROAS_OPTIONS } from "@/modules/mkt_bidding/config";
import {
  refreshCatalogAction,
  type BiddingActionState,
} from "@/app/(dashboard)/marketing/optimalizace/actions";

interface ProjectRef {
  id: string;
  klic: string;
  nazev: string;
}

function buildHref(projekt: string, obdobi: string, roas: number): string {
  const p = new URLSearchParams();
  p.set("projekt", projekt);
  p.set("obdobi", obdobi);
  p.set("roas", String(roas));
  return `/marketing/optimalizace?${p.toString()}`;
}

export function BiddingToolbar({
  projects,
  selectedKlic,
  selectedProjectId,
  period,
  targetRoas,
  canExport,
  canEdit,
  exportQuery,
}: {
  projects: ProjectRef[];
  selectedKlic: string;
  selectedProjectId: string;
  period: PeriodKey;
  targetRoas: number;
  canExport: boolean;
  canEdit: boolean;
  exportQuery: string;
}) {
  const router = useRouter();
  const [refreshState, refreshAction, refreshing] = useActionState<
    BiddingActionState,
    FormData
  >(refreshCatalogAction, {});

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        {/* Projekt (značka) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--muted-foreground)]">Projekt:</span>
          {projects.map((p) => (
            <Button
              key={p.id}
              asChild
              variant={p.klic === selectedKlic ? "default" : "outline"}
              size="sm"
            >
              <Link href={buildHref(p.klic, period, targetRoas)}>{p.nazev}</Link>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Cíl ROAS (agresivita) */}
          <span className="text-sm text-[var(--muted-foreground)]">Cíl ROAS:</span>
          <div className="flex items-center overflow-hidden rounded-md border border-[var(--input)]">
            {TARGET_ROAS_OPTIONS.map((r) => (
              <Button
                key={r}
                asChild
                variant={targetRoas === r ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
              >
                <Link href={buildHref(selectedKlic, period, r)}>
                  {r.toLocaleString("cs-CZ")}×
                </Link>
              </Button>
            ))}
          </div>

          {/* Období */}
          <label className="text-sm text-[var(--muted-foreground)]" htmlFor="obdobi">
            Období:
          </label>
          <select
            id="obdobi"
            value={period}
            onChange={(e) =>
              router.push(buildHref(selectedKlic, e.target.value, targetRoas))
            }
            className="h-9 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Obnovit katalog */}
          {canEdit ? (
            <form action={refreshAction}>
              <input type="hidden" name="projectId" value={selectedProjectId} />
              <Button type="submit" variant="outline" size="sm" disabled={refreshing}>
                <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
                {refreshing ? "Načítám…" : "Obnovit katalog"}
              </Button>
            </form>
          ) : null}

          {/* Vygenerovat import */}
          {canExport ? (
            <>
              <Button asChild variant="default" size="sm">
                <a href={`/api/mkt-bidding/export?format=ebrana${exportQuery}`}>
                  <Download className="size-4" /> Vygenerovat import
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/mkt-bidding/export?format=review${exportQuery}`}>
                  <Download className="size-4" /> Přehled CSV
                </a>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {refreshState.error ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--destructive)]">
          <AlertTriangle className="size-3.5" /> {refreshState.error}
        </p>
      ) : refreshState.info ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--success)]">
          <CheckCircle2 className="size-3.5" /> {refreshState.info}
        </p>
      ) : null}
    </div>
  );
}
