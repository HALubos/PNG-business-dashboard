"use client";

import { useActionState } from "react";
import { RefreshCw, Radio, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  refreshStockAction,
  type FeedActionState,
} from "@/app/(dashboard)/skladovost/actions";

const initial: FeedActionState = {};

export function FeedStatusCard({
  refreshedAt,
  items,
  canRefresh,
}: {
  refreshedAt: string | null; // ISO
  items: number | null;
  canRefresh: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    refreshStockAction,
    initial,
  );

  const refreshedText = refreshedAt
    ? new Date(refreshedAt).toLocaleString("cs-CZ")
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Radio className="size-4 text-[var(--muted-foreground)]" />
        <span>
          Skladovost (živý feed):{" "}
          {refreshedText ? (
            <>
              <strong>aktualizováno {refreshedText}</strong>
              {items != null ? (
                <span className="text-[var(--muted-foreground)]">
                  {" "}
                  · {items} položek
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[var(--warning)]">
              zatím nenačtena (počítá se z XLSX)
            </span>
          )}
        </span>
        {state.ok ? (
          <span className="flex items-center gap-1 text-[var(--success)]">
            <CheckCircle2 className="size-4" /> {state.items} položek (
            {state.inStock} skladem)
          </span>
        ) : null}
        {state.error ? (
          <span className="flex items-center gap-1 text-[var(--destructive)]">
            <AlertTriangle className="size-4" /> {state.error}
          </span>
        ) : null}
      </div>

      {canRefresh ? (
        <form action={formAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending}
          >
            <RefreshCw className={pending ? "animate-spin" : ""} />
            {pending ? "Aktualizuji…" : "Aktualizovat skladovost"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
