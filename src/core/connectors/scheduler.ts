import { prisma } from "@/lib/prisma";
import { startConnectorSync } from "./sync";

// ─────────────────────────────────────────────────────────────
// Lehký IN-PROCESS scheduler. Periodicky spustí sync všech aktivních konektorů,
// které zrovna neběží. Interval je konfigurovatelný přes .env
// (MARKETING_SYNC_INTERVAL_MIN, default 60). Automatizace je pro MARKETING
// povolena (odchylka od „zákazu cronu" v obchodní větvi).
//
// Pozn.: cron/produkční scheduling = fáze 2+. Tohle je in-process tikání,
// spuštěné přes instrumentation (jen v node runtime, jednou na proces).
// ─────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;

function intervalMs(): number {
  const min = Number(process.env.MARKETING_SYNC_INTERVAL_MIN);
  const safe = Number.isFinite(min) && min > 0 ? min : 60;
  return safe * 60_000;
}

/** Jeden tik: najde aktivní konektory mimo stav „processing" a spustí jejich sync. */
async function tick(): Promise<void> {
  try {
    const due = await prisma.connector.findMany({
      where: { active: true, syncStatus: { not: "processing" } },
      select: { id: true },
    });
    // `startConnectorSync` je jediná start cesta a zábor je atomický → když mezitím
    // konektor zabere ruční „Aktualizovat", tik ho přeskočí (žádný dvojí běh).
    for (const c of due) {
      await startConnectorSync(c.id);
    }
  } catch {
    // Scheduler nesmí shodit proces — chyby jednoho tiku ignorujeme.
  }
}

/**
 * Spustí scheduler (idempotentně — opakované volání nic neudělá). Při startu uvolní
 * zaseklý stav „processing": žádný job nepřežije restart procesu, takže processing
 * z předchozího běhu je mrtvý stav, který by jinak tik navždy přeskakoval.
 * (Pozn.: předpokládá jeden běžící proces — multi-instance vyžaduje leader-election.)
 */
export async function startConnectorScheduler(): Promise<void> {
  if (timer) return;
  await prisma.connector
    .updateMany({
      where: { syncStatus: "processing" },
      data: { syncStatus: "idle" },
    })
    .catch(() => {});
  timer = setInterval(() => void tick(), intervalMs());
  // Nedrží proces naživu kvůli scheduleru.
  if (typeof timer.unref === "function") timer.unref();
}

/** Zastaví scheduler (pro úplnost / testy). */
export function stopConnectorScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
