import type { ModuleDefinition } from "../types";

// Modul „Web analytika" (klíč `mkt_analytics`, skupina `marketing`).
// Návštěvnost (sessions/users), konverze, konverzní poměr a trend per značka.
// Čte VÝHRADNĚ přes `kpi.ts`/`MetricFact` (žádný přímý přístup k adaptérům);
// scope projektů přes `project-scope.ts`. Data plní GA4 konektor.
export const mktAnalyticsModule: ModuleDefinition = {
  key: "mkt_analytics",
  nazev: "Web analytika",
  popis:
    "Návštěvnost, konverze a konverzní poměr z GA4 — trend per značka.",
  icon: "LineChart",
  nav: { href: "/marketing/web-analytika", label: "Web analytika" },
  // view = vidět modul, viewall = vidět všechny projekty (značky), export = export.
  actions: ["view", "viewall", "export"],
  poradi: 40,
  group: "marketing",
};
