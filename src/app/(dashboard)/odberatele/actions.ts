"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { canViewReseller } from "@/modules/stock/reseller-scope";
import { refreshResellerFeed } from "@/modules/resellers/feed/feed-service";
import { getFeedFormat } from "@/modules/resellers/feed/formats";

const RESELLERS_VIEWALL = "resellers.viewall";

async function assertCanEdit(resellerId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user, "resellers.edit")) {
    return { user: null, error: "Nemáte oprávnění upravovat odběratele." as const };
  }
  if (!(await canViewReseller(user, resellerId, RESELLERS_VIEWALL))) {
    return { user: null, error: "K tomuto odběrateli nemáte přístup." as const };
  }
  return { user, error: null };
}

export interface ResellerActionState {
  ok?: boolean;
  error?: string;
}

export async function updateResellerAction(
  _prev: ResellerActionState,
  formData: FormData,
): Promise<ResellerActionState> {
  const id = String(formData.get("id") ?? "");
  const { user, error } = await assertCanEdit(id);
  if (error) return { error };

  const nazev = String(formData.get("nazev") ?? "").trim() || null;
  const feedUrl = String(formData.get("feedUrl") ?? "").trim() || null;
  const feedFormatRaw = String(formData.get("feedFormat") ?? "").trim();
  const feedFormat = feedFormatRaw
    ? getFeedFormat(feedFormatRaw).key
    : null;
  const jeVlastni = formData.get("jeVlastni") === "on";

  // feedConfig je relevantní jen pro formát "ostatni"; jinak se vynuluje.
  let feedConfig: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (feedFormat === "ostatni") {
    const raw = String(formData.get("feedConfig") ?? "").trim();
    if (raw) {
      try {
        feedConfig = JSON.parse(raw) as Prisma.InputJsonValue;
      } catch {
        return { error: "feedConfig není platný JSON." };
      }
    }
  }

  await prisma.reseller.update({
    where: { id },
    data: { nazev, feedUrl, feedFormat, jeVlastni, feedConfig },
  });
  await prisma.auditLog.create({
    data: {
      userId: user!.id,
      akce: "resellers.update",
      entita: `Reseller:${id}`,
      detail: { nazev, feedUrl, feedFormat, jeVlastni },
    },
  });

  revalidatePath(`/odberatele/${id}`);
  revalidatePath("/odberatele");
  return { ok: true };
}

export interface FeedRefreshState {
  ok?: boolean;
  error?: string;
  items?: number;
  warnings?: string[];
}

export async function refreshResellerFeedAction(
  _prev: FeedRefreshState,
  formData: FormData,
): Promise<FeedRefreshState> {
  const id = String(formData.get("id") ?? "");
  const { user, error } = await assertCanEdit(id);
  if (error) return { error };

  const report = await refreshResellerFeed(id, user!.id);
  revalidatePath(`/odberatele/${id}`);
  if (!report.ok) {
    return { error: report.error ?? "Aktualizace feedu selhala.", warnings: report.warnings };
  }
  return { ok: true, items: report.items, warnings: report.warnings };
}
