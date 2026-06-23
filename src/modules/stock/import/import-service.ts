import { prisma } from "@/lib/prisma";
import { isOwnShop } from "../constants";
import type { ParsedImport } from "./parser";
import { refreshOurStock } from "../feed/feed-service";

export interface ImportReport {
  snapshotId: string;
  datumExportu: Date;
  pocetProduktu: number;
  pocetOdberatelu: number; // bez vlastních e-shopů
  pocetVlastnich: number;
  pocetRadku: number;
  pocetDostupnosti: number;
  feedItems: number | null; // počet položek z živého feedu (auto-refresh)
  warnings: string[];
}

const AVAIL_CHUNK = 2000;

/**
 * Uloží naparsovaný Price Check jako nový (aktivní) snapshot.
 * Odběratelé jsou globální (kvůli RepCustomer a historii) — upsertují se podle domény.
 */
export async function importSnapshot(
  parsed: ParsedImport,
  opts: { nazevSouboru: string; userId?: string },
): Promise<ImportReport> {
  // Dedup EAN — ponecháme první výskyt (kvůli @@unique([snapshotId, ean])).
  const seenEan = new Set<string>();
  const products = parsed.products.filter((p) => {
    if (seenEan.has(p.ean)) return false;
    seenEan.add(p.ean);
    return true;
  });

  const domeny = parsed.domeny;
  const ownCount = domeny.filter(isOwnShop).length;

  // 1) Globální odběratelé — doplníme chybějící domény.
  const existing = await prisma.reseller.findMany({
    where: { domena: { in: domeny } },
    select: { id: true, domena: true },
  });
  const existingDomains = new Set(existing.map((r) => r.domena));
  const toCreate = domeny
    .filter((d) => !existingDomains.has(d))
    .map((d) => ({ domena: d, nazev: d, jeVlastni: isOwnShop(d) }));
  if (toCreate.length) {
    await prisma.reseller.createMany({ data: toCreate, skipDuplicates: true });
  }
  const allResellers = await prisma.reseller.findMany({
    where: { domena: { in: domeny } },
    select: { id: true, domena: true },
  });
  const resellerIdByDomain = new Map(allResellers.map((r) => [r.domena, r.id]));

  // 2) Nový snapshot (zatím neaktivní).
  const snapshot = await prisma.importSnapshot.create({
    data: {
      nazevSouboru: opts.nazevSouboru,
      datumExportu: parsed.datumExportu,
      nahralUserId: opts.userId ?? null,
      pocetProduktu: products.length,
      pocetOdberatelu: domeny.length - ownCount,
      pocetRadku: parsed.pocetRadku,
      varovani: parsed.warnings,
      aktivni: false,
    },
  });

  // 3) Produkty.
  await prisma.product.createMany({
    data: products.map((p) => ({
      snapshotId: snapshot.id,
      ean: p.ean,
      code: p.code,
      producer: p.producer,
      nazev: p.nazev,
      size: p.size,
      kategorie: p.kategorie,
      kategorieBreadcrumb: p.kategorieBreadcrumb,
      ourStock: p.ourStock,
      salePrice: p.salePrice,
      price: p.price,
    })),
  });
  const created = await prisma.product.findMany({
    where: { snapshotId: snapshot.id },
    select: { id: true, ean: true },
  });
  const productIdByEan = new Map(created.map((p) => [p.ean, p.id]));

  // 4) Dostupnosti u odběratelů.
  const availData: {
    snapshotId: string;
    productId: string;
    resellerId: string;
    stock: number | null;
    availability: string | null;
    cena: number | null;
  }[] = [];
  for (const p of products) {
    const productId = productIdByEan.get(p.ean);
    if (!productId) continue;
    for (const a of p.availabilities) {
      const resellerId = resellerIdByDomain.get(a.domena);
      if (!resellerId) continue;
      availData.push({
        snapshotId: snapshot.id,
        productId,
        resellerId,
        stock: a.stock,
        availability: a.availability,
        cena: a.cena,
      });
    }
  }
  for (let i = 0; i < availData.length; i += AVAIL_CHUNK) {
    await prisma.resellerProductAvailability.createMany({
      data: availData.slice(i, i + AVAIL_CHUNK),
      skipDuplicates: true,
    });
  }

  // 5) Aktivace snapshotu (předchozí deaktivujeme) + audit.
  await prisma.$transaction([
    prisma.importSnapshot.updateMany({
      where: { id: { not: snapshot.id } },
      data: { aktivni: false },
    }),
    prisma.importSnapshot.update({
      where: { id: snapshot.id },
      data: { aktivni: true },
    }),
    prisma.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        akce: "import",
        entita: `ImportSnapshot:${snapshot.id}`,
        detail: {
          soubor: opts.nazevSouboru,
          produkty: products.length,
          odberatelu: domeny.length - ownCount,
        },
      },
    }),
  ]);

  // Auto-refresh živé skladovosti z feedu (best-effort — chyba feedu neshodí import).
  const warnings = [...parsed.warnings];
  let feedItems: number | null = null;
  try {
    const feed = await refreshOurStock(opts.userId);
    feedItems = feed.items;
    warnings.push(...feed.warnings);
  } catch (e) {
    warnings.push(
      `Skladovost z feedu se nepodařilo aktualizovat: ${
        e instanceof Error ? e.message : "neznámá chyba"
      }. Použije se sklad z XLSX.`,
    );
  }

  return {
    snapshotId: snapshot.id,
    datumExportu: parsed.datumExportu,
    pocetProduktu: products.length,
    pocetOdberatelu: domeny.length - ownCount,
    pocetVlastnich: ownCount,
    pocetRadku: parsed.pocetRadku,
    pocetDostupnosti: availData.length,
    feedItems,
    warnings,
  };
}
