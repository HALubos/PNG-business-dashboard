import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import {
  canViewReseller,
  computeOpportunities,
  getActiveSnapshot,
  getStockConfig,
  type Opportunity,
} from "@/modules/stock/opportunities";
import { availabilityLabel } from "@/modules/stock/constants";

const COLUMNS = [
  { header: "Produkt", key: "produkt", width: 40 },
  { header: "Velikost", key: "size", width: 12 },
  { header: "EAN", key: "ean", width: 16 },
  { header: "Značka", key: "producer", width: 12 },
  { header: "Kategorie", key: "kategorie", width: 36 },
  { header: "Naše cena", key: "salePrice", width: 12 },
  { header: "Náš sklad (ks)", key: "ourStock", width: 14 },
  { header: "Sklad do 7 dnů", key: "stock7d", width: 14 },
  { header: "Stav u odběratele", key: "availability", width: 18 },
  { header: "Cena odběratele", key: "resellerCena", width: 14 },
];

function rowFor(o: Opportunity) {
  return {
    produkt: o.nazev,
    size: o.size ?? "",
    ean: o.ean,
    producer: o.producer ?? "",
    kategorie: o.kategorie ?? "",
    salePrice: o.salePrice ?? "",
    ourStock: o.ourStock,
    stock7d: o.stock7d ?? "",
    availability: availabilityLabel(o.availability),
    resellerCena: o.resellerCena ?? "",
  };
}

function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "_");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Nepřihlášen", { status: 401 });
  if (!can(user, "stock.export")) {
    return new Response("Chybí oprávnění stock.export", { status: 403 });
  }

  const resellerId = req.nextUrl.searchParams.get("reseller");
  const format = (req.nextUrl.searchParams.get("format") ?? "xlsx").toLowerCase();
  if (!resellerId) return new Response("Chybí parametr reseller", { status: 400 });

  // RBAC scope: zástupce smí exportovat jen své odběratele.
  if (!(await canViewReseller(user, resellerId))) {
    return new Response("K tomuto odběrateli nemáte přístup", { status: 403 });
  }

  const snapshot = await getActiveSnapshot();
  if (!snapshot) return new Response("Není aktivní snapshot dat", { status: 400 });

  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: { domena: true },
  });
  const config = await getStockConfig();
  const opps = await computeOpportunities(snapshot.id, resellerId, config);

  const datum = snapshot.datumExportu.toISOString().slice(0, 10);
  const baseName = `prilezitosti_${safeName(reseller?.domena ?? "odberatel")}_${datum}`;

  // Audit exportu.
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      akce: "export",
      entita: `Reseller:${resellerId}`,
      detail: { format, pocet: opps.length, snapshot: snapshot.id },
    },
  });

  if (format === "csv") {
    const sep = ";";
    const head = COLUMNS.map((c) => c.header).join(sep);
    const lines = opps.map((o) => {
      const r = rowFor(o) as Record<string, string | number>;
      return COLUMNS.map((c) => {
        const v = String(r[c.key] ?? "");
        return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(sep);
    });
    const csv = "﻿" + [head, ...lines].join("\r\n"); // BOM kvůli diakritice v Excelu
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      },
    });
  }

  // XLSX
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Příležitosti");
  ws.columns = COLUMNS;
  ws.getRow(1).font = { bold: true };
  for (const o of opps) ws.addRow(rowFor(o));
  const buf = await wb.xlsx.writeBuffer();

  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
    },
  });
}
