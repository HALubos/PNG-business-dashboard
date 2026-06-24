import { prisma } from "@/lib/prisma";
import { getConnectorAdapter } from "./registry";
import { toDay } from "./metrics";

// ─────────────────────────────────────────────────────────────
// Synchronizace konektoru — napsáno PŘESNĚ podle `runResellerFeedJob`
// (detached job na pozadí, stav processing→ok/error, NIKDY nehází ven).
// V této dávce je sync DRY-RUN: adaptéry jsou placeholdery vracející prázdno,
// ověřujeme jen smyčku, stav a polling. Reálné adaptéry přijdou v dávce B.
// ─────────────────────────────────────────────────────────────

const DEFAULT_BACKFILL = "2025-01-01";

/** Datum backfillu z .env (default 1. 1. 2025, jako Primio). */
export function backfillFrom(): Date {
  const raw = process.env.MARKETING_BACKFILL_FROM || DEFAULT_BACKFILL;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(DEFAULT_BACKFILL) : d;
}

/** Od kdy stahovat: z `cursor` (inkrement), jinak backfill (první import). */
function syncSince(cursor: string | null): Date {
  if (cursor) {
    const d = new Date(cursor);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return backfillFrom();
}

/**
 * Atomicky „zabere" konektor pro synchronizaci (přepne `idle/ok/error` → `processing`
 * jednou DB operací). Vrací true, pokud se zábor povedl — false znamená, že konektor
 * už zpracovává jiný běh (nebo je neaktivní/smazaný). Tím se brání souběžnému
 * dvojímu syncu téhož konektoru (ruční tlačítko × scheduler tick).
 */
async function claimConnector(connectorId: string): Promise<boolean> {
  const claimed = await prisma.connector.updateMany({
    where: { id: connectorId, active: true, syncStatus: { not: "processing" } },
    data: { syncStatus: "processing", lastError: null },
  });
  return claimed.count === 1;
}

/**
 * Provede synchronizaci konektoru, který už je ve stavu „processing" (zabraný přes
 * `startConnectorSync`). Volá se DETACHED a NIKDY nehází ven — stav uzavře na ok/error.
 */
export async function runConnectorSync(connectorId: string): Promise<void> {
  try {
    const connector = await prisma.connector.findUnique({
      where: { id: connectorId },
    });
    if (!connector) return;

    const adapter = getConnectorAdapter(connector.type);
    if (!adapter) throw new Error(`Neznámý typ konektoru: ${connector.type}`);

    const since = syncSince(connector.cursor);
    const metrics = await adapter.sync({ connector, since });

    // Upsert kanonických metrik (per projekt+zdroj+den+metrika).
    for (const m of metrics) {
      const date = toDay(m.date);
      await prisma.metricFact.upsert({
        where: {
          projectId_source_date_metric: {
            projectId: connector.projectId,
            source: m.source,
            date,
            metric: m.metric,
          },
        },
        update: { value: m.value },
        create: {
          projectId: connector.projectId,
          source: m.source,
          date,
          metric: m.metric,
          value: m.value,
        },
      });
    }

    // Cursor = nejnovější den z dávky; když nic nepřišlo, ponech stávající.
    let cursor = connector.cursor;
    if (metrics.length > 0) {
      const maxMs = Math.max(...metrics.map((m) => toDay(m.date).getTime()));
      cursor = new Date(maxMs).toISOString();
    }

    await prisma.connector.update({
      where: { id: connectorId },
      data: {
        syncStatus: "ok",
        lastSyncAt: new Date(),
        lastError: null,
        cursor,
      },
    });
    await prisma.auditLog.create({
      data: {
        akce: "connector.sync",
        entita: `Connector:${connectorId}`,
        detail: { type: connector.type, facts: metrics.length },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Synchronizace konektoru selhala.";
    await prisma.connector
      .update({
        where: { id: connectorId },
        data: { syncStatus: "error", lastError: msg },
      })
      .catch(() => {});
  }
}

/**
 * JEDINÁ start cesta pro sync (volá ji ruční akce i scheduler). Atomicky zabere
 * konektor a teprve při úspěchu odpálí job na POZADÍ (bez čekání). Request neblokuje,
 * UI poll-uje stav. Vrací, zda se sync skutečně spustil (false = už běžel).
 */
export async function startConnectorSync(connectorId: string): Promise<boolean> {
  const claimed = await claimConnector(connectorId);
  if (claimed) void runConnectorSync(connectorId);
  return claimed;
}
