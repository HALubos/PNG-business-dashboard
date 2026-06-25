"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  LineChart,
  Megaphone,
  Plug,
  RefreshCw,
  Unplug,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Clock,
  Info,
  type LucideIcon,
} from "lucide-react";

import type { ConnectorKind, ConnectorType } from "@/generated/prisma/client";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ConnectorCategory,
} from "@/core/connectors/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  connectConnectorAction,
  disconnectConnectorAction,
  syncConnectorAction,
  type ConnectorActionState,
} from "@/app/(dashboard)/integrace/actions";

export interface CatalogConnector {
  id: string;
  syncStatus: "idle" | "processing" | "ok" | "error";
  lastSyncAt: string | null;
  lastError: string | null;
  feedUrl: string | null;
  active: boolean;
}

export interface CatalogCard {
  type: ConnectorType;
  kind: ConnectorKind;
  nazev: string;
  popis: string;
  icon: string;
  category: ConnectorCategory;
  overridesRevenue: boolean;
  comingSoon: boolean;
  connector: CatalogConnector | null;
}

interface ProjectRef {
  id: string;
  klic: string;
  nazev: string;
}

const ICONS: Record<string, LucideIcon> = {
  ShoppingCart,
  LineChart,
  Megaphone,
};

function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Plug;
}

function StatusBadge({ card }: { card: CatalogCard }) {
  if (card.comingSoon) {
    return (
      <Badge variant="outline">
        <Clock className="mr-1 size-3" /> Brzy
      </Badge>
    );
  }
  const s = card.connector?.syncStatus;
  if (!card.connector) {
    return <Badge variant="outline">Nepřipojeno</Badge>;
  }
  if (s === "processing") {
    return (
      <Badge variant="secondary">
        <Loader2 className="mr-1 size-3 animate-spin" /> Stahuji…
      </Badge>
    );
  }
  if (s === "error") {
    return (
      <Badge variant="warning">
        <AlertTriangle className="mr-1 size-3" /> Chyba
      </Badge>
    );
  }
  if (s === "ok") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 size-3" /> Připojeno
      </Badge>
    );
  }
  // idle (default po připojení, před prvním syncem) / neznámý stav — ne „úspěch".
  return (
    <Badge variant="secondary">
      <Clock className="mr-1 size-3" /> Nesynchronizováno
    </Badge>
  );
}

function CardItem({
  card,
  projectId,
  iconNode,
}: {
  card: CatalogCard;
  projectId: string;
  iconNode: ReactNode;
}) {
  const [connectState, connectAction, connecting] = useActionState<
    ConnectorActionState,
    FormData
  >(connectConnectorAction, {});
  const [disconnectState, disconnectAction, disconnecting] = useActionState<
    ConnectorActionState,
    FormData
  >(disconnectConnectorAction, {});
  const [syncState, syncAction, syncing] = useActionState<
    ConnectorActionState,
    FormData
  >(syncConnectorAction, {});

  const connected = !!card.connector;
  const processing = card.connector?.syncStatus === "processing";

  return (
    <Card className={cn(card.comingSoon && "opacity-70")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
            {iconNode}
          </div>
          <StatusBadge card={card} />
        </div>
        <CardTitle className="text-base">{card.nazev}</CardTitle>
        <CardDescription>{card.popis}</CardDescription>
        {card.overridesRevenue ? (
          <p className="text-xs font-medium text-[var(--success)]">
            Přesné tržby — přebíjí GA4 data.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {card.comingSoon ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Připravujeme — bude k dispozici v další dávce.
          </p>
        ) : connected ? (
          <>
            {card.connector?.syncStatus === "error" && card.connector.lastError ? (
              <p className="flex items-center gap-1.5 text-xs text-[var(--destructive)]">
                <AlertTriangle className="size-3.5" /> {card.connector.lastError}
              </p>
            ) : card.connector?.lastSyncAt ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Naposledy:{" "}
                {new Date(card.connector.lastSyncAt).toLocaleString("cs-CZ")}
              </p>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                Zatím nesynchronizováno.
              </p>
            )}
            <div className="flex items-center gap-2">
              <form action={syncAction}>
                <input
                  type="hidden"
                  name="connectorId"
                  value={card.connector!.id}
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={syncing || processing}
                >
                  <RefreshCw
                    className={cn(
                      "size-4",
                      (syncing || processing) && "animate-spin",
                    )}
                  />
                  Aktualizovat
                </Button>
              </form>
              <form action={disconnectAction}>
                <input
                  type="hidden"
                  name="connectorId"
                  value={card.connector!.id}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={disconnecting}
                  className="text-[var(--destructive)]"
                >
                  <Unplug className="size-4" /> Odpojit
                </Button>
              </form>
            </div>
            {syncState.error || disconnectState.error ? (
              <p className="flex items-center gap-1.5 text-xs text-[var(--destructive)]">
                <AlertTriangle className="size-3.5" />{" "}
                {syncState.error || disconnectState.error}
              </p>
            ) : null}
          </>
        ) : card.kind === "url_feed" ? (
          <form action={connectAction} className="space-y-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="type" value={card.type} />
            <Input
              name="feedUrl"
              type="url"
              required
              placeholder="https://…/api/orders?hash=…"
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Vložte permanentní URL exportu (s autorizačním hashem; lze omezit na
              IP).
            </p>
            <Button type="submit" size="sm" disabled={connecting}>
              <Plug className="size-4" /> {connecting ? "Připojuji…" : "Připojit"}
            </Button>
            {connectState.error ? (
              <p className="text-xs text-[var(--destructive)]">
                {connectState.error}
              </p>
            ) : null}
          </form>
        ) : card.kind === "oauth_api" && card.type === "ga4" ? (
          // GA4 = první OAuth konektor. Formulář (GET) předá Property ID start
          // route, ta přesměruje na Google consent; tokeny uloží callback.
          <form method="get" action="/api/connectors/ga4/start" className="space-y-2">
            <input type="hidden" name="projectId" value={projectId} />
            <Input
              name="propertyId"
              inputMode="numeric"
              pattern="\d+"
              required
              placeholder="GA4 Property ID (např. 123456789)"
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Připojení přes Google (OAuth) — uděluje se přístup jen pro čtení GA4.
            </p>
            <Button type="submit" size="sm">
              <Plug className="size-4" /> Připojit přes Google
            </Button>
          </form>
        ) : card.kind === "oauth_api" && card.type === "google_ads" ? (
          // Google Ads — OAuth (sdílený Google client). Formulář (GET) předá ID
          // účtu start route, ta přesměruje na Google consent (scope adwords).
          <form
            method="get"
            action="/api/connectors/google-ads/start"
            className="space-y-2"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <Input
              name="customerId"
              inputMode="numeric"
              required
              placeholder="ID účtu Google Ads (např. 123-456-7890)"
            />
            <Input
              name="loginCustomerId"
              inputMode="numeric"
              placeholder="ID správce (MCC) — volitelné"
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Připojení přes Google (OAuth) — přístup jen pro čtení reportů Google Ads.
            </p>
            <Button type="submit" size="sm">
              <Plug className="size-4" /> Připojit přes Google
            </Button>
          </form>
        ) : card.kind === "oauth_api" && card.type === "meta_ads" ? (
          // Meta Ads — OAuth (Facebook Login). Formulář (GET) předá ID reklamního
          // účtu start route, ta přesměruje na Meta consent (scope ads_read).
          <form
            method="get"
            action="/api/connectors/meta-ads/start"
            className="space-y-2"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <Input
              name="adAccountId"
              inputMode="numeric"
              required
              placeholder="ID reklamního účtu (např. act_1234567890)"
            />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Připojení přes Meta (OAuth) — přístup jen pro čtení reklamních dat.
            </p>
            <Button type="submit" size="sm">
              <Plug className="size-4" /> Připojit přes Meta
            </Button>
          </form>
        ) : (
          <div className="space-y-2">
            <Button type="button" size="sm" disabled>
              <Plug className="size-4" /> Připojit přes OAuth
            </Button>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Připojení přes OAuth bude k dispozici v další dávce.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function IntegraceCatalog({
  projects,
  selectedKlic,
  selectedProjectId,
  cards,
  backfillFrom,
}: {
  projects: ProjectRef[];
  selectedKlic: string;
  selectedProjectId: string;
  cards: CatalogCard[];
  backfillFrom: string;
}) {
  const router = useRouter();

  // Polling: dokud nějaký konektor běží na pozadí, průběžně načítej.
  const anyProcessing = cards.some(
    (c) => c.connector?.syncStatus === "processing",
  );
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [anyProcessing, router]);

  // Karty seskupené dle kategorie (jen kategorie, které mají alespoň jednu kartu).
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: cards.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Přepínač projektu */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted-foreground)]">
          Nastavení pro projekt:
        </span>
        {projects.map((p) => (
          <Button
            key={p.id}
            asChild
            variant={p.klic === selectedKlic ? "default" : "outline"}
            size="sm"
          >
            <Link href={`/integrace?projekt=${p.klic}`}>{p.nazev}</Link>
          </Button>
        ))}
      </div>

      {/* Hláška o backfillu */}
      <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
        <p className="text-[var(--muted-foreground)]">
          Po připojení se stáhnou data od {backfillFrom}. U větších účtů může první
          import trvat desítky minut — běží na pozadí, stav uvidíte u karty.
        </p>
      </div>

      {/* Mřížka karet dle kategorií */}
      {groups.map((g) => (
        <div key={g.cat} className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted-foreground)]">
            {CATEGORY_LABELS[g.cat]}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((card) => {
              const Icon = iconFor(card.icon);
              return (
                <CardItem
                  key={card.type}
                  card={card}
                  projectId={selectedProjectId}
                  iconNode={<Icon className="size-4" />}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
