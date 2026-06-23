"use client";

import { useActionState } from "react";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  importAction,
  type ImportActionState,
} from "@/app/(dashboard)/skladovost/actions";

const initial: ImportActionState = {};

export function ImportCard() {
  const [state, formAction, pending] = useActionState(importAction, initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="size-4" /> Import Price Check (XLSX)
        </CardTitle>
        <CardDescription>
          Nahrání vytvoří nový datový snapshot a nastaví ho jako aktivní.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--secondary)] file:px-3 file:py-2 file:text-sm file:font-medium hover:file:opacity-80"
          />
          <Button type="submit" disabled={pending} className="shrink-0">
            {pending ? "Importuji…" : "Importovat"}
          </Button>
        </form>

        {state.error ? (
          <p className="flex items-center gap-2 rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
            <AlertTriangle className="size-4" /> {state.error}
          </p>
        ) : null}

        {state.ok && state.report ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-[var(--success)]">
              <CheckCircle2 className="size-4" /> Import dokončen
            </p>
            <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[var(--muted-foreground)] sm:grid-cols-3">
              <li>Produktů: {state.report.pocetProduktu}</li>
              <li>Odběratelů: {state.report.pocetOdberatelu}</li>
              <li>Vlastních e-shopů: {state.report.pocetVlastnich}</li>
              <li>Záznamů dostupnosti: {state.report.pocetDostupnosti}</li>
              <li>
                Skladovost z feedu:{" "}
                {state.report.feedItems != null
                  ? `${state.report.feedItems} položek`
                  : "neaktualizováno"}
              </li>
              <li>
                Datum exportu:{" "}
                {new Date(state.report.datumExportu).toLocaleDateString(
                  "cs-CZ",
                  { timeZone: "UTC" },
                )}
              </li>
            </ul>
            {state.report.warnings.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[var(--warning)]">
                  {state.report.warnings.length} varování
                </summary>
                <ul className="mt-1 list-inside list-disc text-xs text-[var(--muted-foreground)]">
                  {state.report.warnings.slice(0, 20).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
