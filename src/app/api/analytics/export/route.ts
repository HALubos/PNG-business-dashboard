import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { getVisibleResellers } from "@/modules/stock/reseller-scope";
import {
  aggregateOpportunities,
  ANALYTICS_VIEWALL,
} from "@/modules/analytics/aggregate";

type Col = { header: string; key: string; width: number };

const RESELLER_COLS: Col[] = [
  { header: "Odběratel", key: "domena", width: 28 },
  { header: "Název", key: "nazev", width: 24 },
  { header: "Příležitostí", key: "opportunityCount", width: 14 },
  { header: "Hodnota (Kč)", key: "opportunityValue", width: 16 },
  { header: "Značky", key: "brandCount", width: 10 },
  { header: "Kategorie", key: "categoryCount", width: 12 },
  { header: "Trend", key: "delta", width: 10 },
];

const PRODUCT_COLS: Col[] = [
  { header: "Produkt", key: "nazev", width: 40 },
  { header: "Velikost", key: "size", width: 12 },
  { header: "EAN", key: "ean", width: 16 },
  { header: "Značka", key: "producer", width: 12 },
  { header: "Kategorie", key: "kategorie", width: 36 },
  { header: "Náš sklad (ks)", key: "ourStock", width: 14 },
  { header: "Sklad do 7 dnů", key: "stock7d", width: 14 },
  { header: "U odběratelů", key: "resellerCount", width: 14 },
  { header: "Hodnota (Kč)", key: "value", width: 16 },
  { header: "Trend", key: "delta", width: 10 },
];

const delta = (d: number | null) => (d == null ? "" : d);

function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "_");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Nepřihlášen", { status: 401 });
  if (!can(user, "analytics.export")) {
    return new Response("Chybí oprávnění analytics.export", { status: 403 });
  }

  const type = (req.nextUrl.searchParams.get("type") ?? "resellers").toLowerCase();
  const format = (req.nextUrl.searchParams.get("format") ?? "xlsx").toLowerCase();
  const producer = req.nextUrl.searchParams.get("producer") ?? undefined;
  const kategorie = req.nextUrl.searchParams.get("kategorie") ?? undefined;
  if (type !== "resellers" && type !== "products") {
    return new Response("Neplatný typ exportu", { status: 400 });
  }

  // RBAC scope: stejně jako stránka (analytics.viewall → vše, jinak RepCustomer).
  const visibleResellers = await getVisibleResellers(user, ANALYTICS_VIEWALL);
  const result = await aggregateOpportunities({
    visibleResellers,
    filters: { producer, kategorie },
  });
  if (!result.summary.snapshotDate) {
    return new Response("Není aktivní snapshot dat", { status: 400 });
  }

  const cols = type === "resellers" ? RESELLER_COLS : PRODUCT_COLS;
  const rows: Record<string, string | number>[] =
    type === "resellers"
      ? result.resellerLeaderboard.map((r) => ({
          domena: r.domena,
          nazev: r.nazev ?? "",
          opportunityCount: r.opportunityCount,
          opportunityValue: r.opportunityValue,
          brandCount: r.brandCount,
          categoryCount: r.categoryCount,
          delta: delta(r.deltaCount),
        }))
      : result.topProducts.map((p) => ({
          nazev: p.nazev,
          size: p.size ?? "",
          ean: p.ean,
          producer: p.producer ?? "",
          kategorie: p.kategorie ?? "",
          ourStock: p.ourStock,
          stock7d: p.stock7d ?? "",
          resellerCount: p.resellerCount,
          value: p.value,
          delta: delta(p.deltaCount),
        }));

  const datum = result.summary.snapshotDate.toISOString().slice(0, 10);
  const baseName = `analytika_${type === "resellers" ? "odberatele" : "produkty"}_${datum}`;

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      akce: "export",
      entita: `Analytics:${type}`,
      detail: { format, pocet: rows.length, producer, kategorie },
    },
  });

  if (format === "csv") {
    const sep = ";";
    const head = cols.map((c) => c.header).join(sep);
    const lines = rows.map((r) =>
      cols
        .map((c) => {
          const v = String(r[c.key] ?? "");
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
  const ws = wb.addWorksheet(type === "resellers" ? "Odběratelé" : "Produkty");
  ws.columns = cols;
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();

  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName(baseName)}.xlsx"`,
    },
  });
}
