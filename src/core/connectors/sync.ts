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
 * Spustí synchronizaci jednoho konektoru. Volá se DETACHED (`void runConnectorSync`)
 * po nastavení stavu na „processing" (stejně jako u feedu odběratele). UI poll-uje.
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
 * Nastaví konektor na „processing" a odpálí job na POZADÍ (bez čekání).
 * Sdílí stock/feed vzor: request neblokuje, UI poll-uje stav.
 */
export async function startConnectorSync(connectorId: string): Promise<void> {
  await prisma.connector.update({
    where: { id: connectorId },
    data: { syncStatus: "processing", lastError: null },
  });
  void runConnectorSync(connectorId);
}
