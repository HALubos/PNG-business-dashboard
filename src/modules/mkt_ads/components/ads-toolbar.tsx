"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VatMode } from "@/core/connectors/kpi";
import { PERIODS, type PeriodKey } from "../period";

interface ProjectRef {
  id: string;
  klic: string;
  nazev: string;
}

const dphParam = (v: VatMode) => (v === "with" ? "s" : "bez");

function buildHref(projekt: string, obdobi: string, vatMode: VatMode): string {
  const p = new URLSearchParams();
  p.set("projekt", projekt);
  p.set("obdobi", obdobi);
  p.set("dph", dphParam(vatMode));
  return `/reklamni-vykon?${p.toString()}`;
}

export function AdsToolbar({
  projects,
  selectedKlic,
  period,
  vatMode,
  canExport,
  exportQuery,
}: {
  projects: ProjectRef[];
  selectedKlic: string;
  period: PeriodKey;
  vatMode: VatMode;
  canExport: boolean;
  exportQuery: string;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      {/* Přepínač projektu (značky) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted-foreground)]">Projekt:</span>
        {projects.map((p) => (
          <Button
            key={p.id}
            asChild
            variant={p.klic === selectedKlic ? "default" : "outline"}
            size="sm"
          >
            <Link href={buildHref(p.klic, period, vatMode)}>{p.nazev}</Link>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* DPH přepínač */}
        <div className="flex items-center overflow-hidden rounded-md border border-[var(--input)]">
          {(["without", "with"] as const).map((m) => (
            <Button
              key={m}
              asChild
              variant={vatMode === m ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
            >
              <Link href={buildHref(selectedKlic, period, m)}>
                {m === "without" ? "Bez DPH" : "S DPH"}
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
          onChange={(e) => router.push(buildHref(selectedKlic, e.target.value, vatMode))}
          className="h-9 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
        >
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Export */}
        {canExport ? (
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/mkt-ads/export?format=xlsx${exportQuery}`}>
                <Download className="size-4" /> XLSX
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/mkt-ads/export?format=csv${exportQuery}`}>
                <Download className="size-4" /> CSV
              </a>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
