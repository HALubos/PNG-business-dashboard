"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Loader2,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateResellerAction,
  refreshResellerFeedAction,
  type ResellerActionState,
  type FeedRefreshState,
} from "@/app/(dashboard)/odberatele/actions";

interface ResellerData {
  id: string;
  domena: string;
  nazev: string | null;
  jeVlastni: boolean;
  feedUrl: string | null;
  feedFormat: string | null;
  feedConfig: string; // JSON string (prázdné = žádný)
  feedRefreshedAt: string | null;
  feedItems: number | null;
  feedStatus: string | null; // processing | ok | error
  feedError: string | null;
}

export function ResellerEditForm({
  reseller,
  formatOptions,
  canEdit,
}: {
  reseller: ResellerData;
  formatOptions: { key: string; label: string }[];
  canEdit: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState<
    ResellerActionState,
    FormData
  >(updateResellerAction, {});
  const [feedState, feedAction, refreshing] = useActionState<
    FeedRefreshState,
    FormData
  >(refreshResellerFeedAction, {});

  const [format, setFormat] = useState(reseller.feedFormat ?? "");

  // Běh na pozadí: dokud je stav „processing", průběžně načítej stránku.
  const router = useRouter();
  const processing = reseller.feedStatus === "processing";
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [processing, router]);

  return (
    <div className="space-y-6">
      {/* Karta odběratele */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Karta odběratele</CardTitle>
          <CardDescription>
            Údaje a nastavení feedu dostupnosti. Formát feedu určuje, jak se z něj
            čtou pole.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveAction} className="space-y-4">
            <input type="hidden" name="id" value={reseller.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="domena">Doména</Label>
                <Input id="domena" value={reseller.domena} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nazev">Název</Label>
                <Input
                  id="nazev"
                  name="nazev"
                  defaultValue={reseller.nazev ?? ""}
                  disabled={!canEdit}
                  placeholder="(volitelné)"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedUrl">Feed URL</Label>
              <Input
                id="feedUrl"
                name="feedUrl"
                type="url"
                defaultValue={reseller.feedUrl ?? ""}
                disabled={!canEdit}
                placeholder="https://…"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feedFormat">Formát feedu</Label>
                <select
                  id="feedFormat"
                  name="feedFormat"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  disabled={!canEdit}
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-sm disabled:opacity-60"
                >
                  <option value="">— nevybráno —</option>
                  {formatOptions.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    name="jeVlastni"
                    defaultChecked={reseller.jeVlastni}
                    disabled={!canEdit}
                    className="size-4"
                  />
                  Vlastní e-shop (nepočítá se jako odběratel)
                </label>
              </div>
            </div>

            {format === "ostatni" ? (
              <div className="space-y-2">
                <Label htmlFor="feedConfig">
                  Ruční mapování (JSON) — jen pro formát Ostatní
                </Label>
                <textarea
                  id="feedConfig"
                  name="feedConfig"
                  defaultValue={reseller.feedConfig}
                  disabled={!canEdit}
                  rows={6}
                  spellCheck={false}
                  placeholder={`{\n  "itemPath": "SHOPITEM",\n  "eanField": "EAN",\n  "stockField": "STOCK",\n  "availabilityField": "DELIVERY"\n}`}
                  className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] p-3 font-mono text-xs disabled:opacity-60"
                />
              </div>
            ) : null}

            {canEdit ? (
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                  <Save className="size-4" />
                  {saving ? "Ukládám…" : "Uložit"}
                </Button>
                {saveState.ok ? (
                  <span className="flex items-center gap-1 text-sm text-[var(--success)]">
                    <CheckCircle2 className="size-4" /> Uloženo
                  </span>
                ) : null}
                {saveState.error ? (
                  <span className="text-sm text-[var(--destructive)]">
                    {saveState.error}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Nemáte oprávnění upravovat (jen čtení).
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Feed dostupnosti */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4" /> Feed dostupnosti
          </CardTitle>
          <CardDescription>
            {processing ? (
              <span className="flex items-center gap-2 text-[var(--foreground)]">
                <Loader2 className="size-4 animate-spin" /> Zpracovává se na
                pozadí…
              </span>
            ) : reseller.feedStatus === "error" ? (
              <span className="flex items-center gap-2 text-[var(--destructive)]">
                <AlertTriangle className="size-4" />{" "}
                {reseller.feedError ?? "Zpracování feedu selhalo."}
              </span>
            ) : reseller.feedRefreshedAt ? (
              <>
                Naposledy aktualizováno{" "}
                {new Date(reseller.feedRefreshedAt).toLocaleString("cs-CZ")} ·{" "}
                {reseller.feedItems ?? 0} položek z našeho sortimentu.
              </>
            ) : (
              "Feed zatím nebyl aktualizován — dostupnost se bere z Price Checku."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {canEdit ? (
            <form action={feedAction}>
              <input type="hidden" name="id" value={reseller.id} />
              <Button
                type="submit"
                variant="outline"
                disabled={refreshing || processing || !reseller.feedUrl}
              >
                <RefreshCw
                  className={refreshing || processing ? "animate-spin" : ""}
                />
                {processing ? "Zpracovává se…" : "Aktualizovat feed"}
              </Button>
              {!reseller.feedUrl ? (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Nejdřív nastav a ulož Feed URL.
                </p>
              ) : null}
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Feed se zpracuje na pozadí (uloží se jen produkty z našeho
                sortimentu).
              </p>
            </form>
          ) : null}

          {feedState.error ? (
            <p className="flex items-center gap-2 text-sm text-[var(--destructive)]">
              <AlertTriangle className="size-4" /> {feedState.error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
