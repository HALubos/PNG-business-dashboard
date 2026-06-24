// Next.js instrumentation — spustí se jednou při startu serveru.
// Tady nastartujeme in-process scheduler marketingových konektorů (jen v Node
// runtime, ne v edge/buildu). Scheduler tiká dle MARKETING_SYNC_INTERVAL_MIN.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startConnectorScheduler } = await import(
    "@/core/connectors/scheduler"
  );
  await startConnectorScheduler();
}
