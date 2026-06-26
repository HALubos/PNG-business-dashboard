import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/core/projects/project-scope";
import { getProjectDateBounds } from "@/modules/mkt_ads/data";
import { resolvePeriod, DEFAULT_PERIOD } from "@/modules/mkt_ads/period";
import {
  loadBiddingData,
  MKT_BIDDING_VIEWALL,
} from "@/modules/mkt_bidding/data";
import { isTargetRoas } from "@/modules/mkt_bidding/config";
import { biddableProposals } from "@/modules/mkt_bidding/output/ebrana";
import { getOutputFormat } from "@/modules/mkt_bidding/output/registry";
import type { BiddingProposal } from "@/modules/mkt_bidding/engine";

// Export modulu „Optimalizace srovnávačů":
//   ?format=ebrana  → importní .xlsx pro e-shop (SCHVÁLENÍ = uloží navržené bidy do
//                     BiddingBid → příští výpočet z nich bere current_cpc / denní limit).
//   ?format=review  → přehledové CSV se všemi návrhy a důvody.

function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "_");
}

const ACTION_LABEL: Record<BiddingProposal["action"], string> = {
  increase: "Zvýšit",
  decrease: "Snížit",
  pause: "Pauza",
  keep: "Beze změny",
  skip: "Bez bidu",
};

function reviewCsv(proposals: BiddingProposal[]): string {
  const sep = ";";
  const head = [
    "SKU",
    "Název",
    "Kategorie",
    "Cena",
    "Prokliky",
    "Náklad",
    "Objednávky",
    "Obrat",
    "PNO",
    "Fáze",
    "Staré CPC",
    "Navržené CPC",
    "Změna %",
    "Akce",
    "Důvod",
  ];
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = proposals.map((p) =>
    [
      p.itemId,
      p.name ?? "",
      p.internalCategory ?? "",
      p.price ?? "",
      p.clicks,
      Math.round(p.cost),
      p.orders,
      Math.round(p.revenue),
      p.pno == null ? "" : (p.pno * 100).toFixed(1),
      p.phase,
      p.currentCpc == null ? "" : p.currentCpc.toFixed(2),
      p.proposedCpc == null ? "" : p.proposedCpc.toFixed(2),
      p.changePct == null ? "" : (p.changePct * 100).toFixed(1),
      ACTION_LABEL[p.action],
      p.reason,
    ]
      .map(cell)
      .join(sep),
  );
  return "﻿" + [head.join(sep), ...lines].join("\r\n");
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Nepřihlášen", { status: 401 });
  if (!can(user, "mkt_bidding.export")) {
    return new Response("Chybí oprávnění mkt_bidding.export", { status: 403 });
  }

  const klic = req.nextUrl.searchParams.get("projekt") ?? "";
  const obdobi = req.nextUrl.searchParams.get("obdobi") ?? DEFAULT_PERIOD;
  const format = (req.nextUrl.searchParams.get("format") ?? "ebrana").toLowerCase();
  const roasRaw = Number(req.nextUrl.searchParams.get("roas"));
  const targetRoas = isTargetRoas(roasRaw) ? roasRaw : 3.0;

  const project = await prisma.project.findUnique({
    where: { klic },
    select: { id: true, klic: true, nazev: true },
  });
  if (!project) return new Response("Projekt nenalezen", { status: 404 });
  if (!(await canViewProject(user, project.id, MKT_BIDDING_VIEWALL))) {
    return new Response("K tomuto projektu nemáte přístup", { status: 403 });
  }

  const bounds = await getProjectDateBounds(project.id);
  const period = resolvePeriod(obdobi, bounds);
  const data = await loadBiddingData(
    project.id,
    project.klic,
    period.from,
    period.to,
    targetRoas,
  );
  const baseName = `heureka-cpc_${project.klic}_${period.key}_roas${targetRoas}`;

  // ── Přehledové CSV ──
  if (format === "review") {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        akce: "export",
        entita: `MktBidding:${project.klic}`,
        detail: { format, obdobi: period.key, roas: targetRoas, navrhu: data.proposals.length },
      },
    });
    return new Response(reviewCsv(data.proposals), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName(baseName)}_prehled.csv"`,
      },
    });
  }

  // ── Importní soubor pro e-shop (output adaptér) ──
  const out = getOutputFormat(format);
  if (!out || out.comingSoon || !out.build) {
    return new Response("Neznámý / zatím nedostupný formát importu", { status: 400 });
  }

  const biddable = biddableProposals(data.proposals);
  const buf = await out.build(data.proposals);

  // SCHVÁLENÍ = uložení navržených bidů (current_cpc pro příští denní diff/limit).
  for (const p of biddable) {
    if (p.proposedCpc == null) continue;
    await prisma.biddingBid.upsert({
      where: { projectId_itemId: { projectId: project.id, itemId: p.itemId } },
      update: { cpc: p.proposedCpc },
      create: { projectId: project.id, itemId: p.itemId, cpc: p.proposedCpc },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      akce: "export",
      entita: `MktBidding:${project.klic}`,
      detail: {
        format,
        obdobi: period.key,
        roas: targetRoas,
        bidu: biddable.length,
        schvalenoBidu: biddable.length,
      },
    },
  });

  return new Response(buf, {
    headers: {
      "Content-Type": out.contentType,
      "Content-Disposition": `attachment; filename="${safeName(baseName)}.${out.ext}"`,
    },
  });
}
