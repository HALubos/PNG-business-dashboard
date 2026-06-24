import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/core/projects/project-scope";
import {
  loadAnalyticsData,
  MKT_ANALYTICS_VIEWALL,
} from "@/modules/mkt_analytics/data";
import { getProjectDateBounds } from "@/modules/mkt_ads/data";
import { resolvePeriod, DEFAULT_PERIOD } from "@/modules/mkt_ads/period";

// Export modulu „Web analytika" — denní řada (návštěvy/uživatelé/konverze) za
// projekt a období. Čte přes stejnou datovou vrstvu (`loadAnalyticsData`) jako stránka.

type Col = { header: string; key: string; width: number };

const dailyCols: Col[] = [
  { header: "Datum", key: "date", width: 14 },
  { header: "Návštěvy", key: "sessions", width: 14 },
  { header: "Uživatelé", key: "users", width: 14 },
  { header: "Konverze", key: "conversions", width: 12 },
];

function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "_");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Nepřihlášen", { status: 401 });
  if (!can(user, "mkt_analytics.export")) {
    return new Response("Chybí oprávnění mkt_analytics.export", { status: 403 });
  }

  const klic = req.nextUrl.searchParams.get("projekt") ?? "";
  const obdobi = req.nextUrl.searchParams.get("obdobi") ?? DEFAULT_PERIOD;
  const format = (req.nextUrl.searchParams.get("format") ?? "xlsx").toLowerCase();

  const project = await prisma.project.findUnique({
    where: { klic },
    select: { id: true, klic: true, nazev: true },
  });
  if (!project) return new Response("Projekt nenalezen", { status: 404 });
  if (!(await canViewProject(user, project.id, MKT_ANALYTICS_VIEWALL))) {
    return new Response("K tomuto projektu nemáte přístup", { status: 403 });
  }

  const bounds = await getProjectDateBounds(project.id);
  const period = resolvePeriod(obdobi, bounds);
  const data = await loadAnalyticsData(project.id, period.from, period.to);

  const rows = data.daily.map((d) => ({
    date: d.date,
    sessions: Math.round(d.sessions),
    users: Math.round(d.users),
    conversions: Math.round(d.conversions),
  }));

  const baseName = `web-analytika_${project.klic}_${period.key}`;

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      akce: "export",
      entita: `MktAnalytics:${project.klic}`,
      detail: { format, obdobi: period.key, dny: rows.length },
    },
  });

  if (format === "csv") {
    const sep = ";";
    const head = dailyCols.map((c) => c.header).join(sep);
    const lines = rows.map((r) =>
      dailyCols
        .map((c) => {
          const v = String(r[c.key as keyof typeof r] ?? "");
          return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(sep),
    );
    const csv = "﻿" + [head, ...lines].join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName(baseName)}.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();

  // List 1 — denní řada.
  const ws = wb.addWorksheet("Denně");
  ws.columns = dailyCols;
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);

  // List 2 — KPI souhrn za období.
  const k = data.kpi;
  const sum = wb.addWorksheet("KPI souhrn");
  sum.columns = [
    { header: "Ukazatel", key: "k", width: 24 },
    { header: "Hodnota", key: "v", width: 20 },
  ];
  sum.getRow(1).font = { bold: true };
  sum.addRows([
    { k: "Projekt", v: project.nazev },
    { k: "Období", v: period.label },
    { k: "Návštěvy", v: Math.round(k.navstevy) },
    { k: "Uživatelé", v: Math.round(k.uzivatele) },
    { k: "Konverze", v: k.konverze },
    { k: "Konverzní poměr", v: k.konverzniPomer ?? "—" },
  ]);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName(baseName)}.xlsx"`,
    },
  });
}
