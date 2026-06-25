"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import type { ConnectorType } from "@/generated/prisma/client";
import { getConnectorAdapter } from "@/core/connectors/registry";
import { canViewProject } from "@/core/projects/project-scope";
import { startConnectorSync } from "@/core/connectors/sync";
import { encryptJson } from "@/core/connectors/crypto";

const CONNECTORS_PERM = "admin.connectors";
const PROJECTS_VIEWALL = "admin.projects";

export interface ConnectorActionState {
  ok?: boolean;
  error?: string;
}

/** Ověří právo admin.connectors a přístup k projektu. */
async function assertCanManage(projectId: string) {
  const user = await getCurrentUser();
  if (!user || !can(user, CONNECTORS_PERM)) {
    return { user: null, error: "Nemáte oprávnění spravovat konektory." as const };
  }
  if (!(await canViewProject(user, projectId, PROJECTS_VIEWALL))) {
    return { user: null, error: "K tomuto projektu nemáte přístup." as const };
  }
  return { user, error: null };
}

/**
 * Připojí konektor k projektu. V této dávce podporujeme jen `url_feed` (Shoptet);
 * OAuth adaptéry jsou „brzy" (disabled) — připojení přijde v dávce B.
 */
export async function connectConnectorAction(
  _prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const type = String(formData.get("type") ?? "") as ConnectorType;

  const { user, error } = await assertCanManage(projectId);
  if (error) return { error };

  const adapter = getConnectorAdapter(type);
  if (!adapter) return { error: "Neznámý typ konektoru." };
  if (adapter.comingSoon) {
    return { error: "Tento konektor zatím není k dispozici (připravujeme)." };
  }
  if (adapter.kind !== "url_feed") {
    return {
      error: "Připojení přes OAuth bude k dispozici v další dávce.",
    };
  }

  const feedUrl = String(formData.get("feedUrl") ?? "").trim();
  if (!feedUrl) return { error: "Zadejte URL feedu." };

  // Upsert dle (projectId, type) — opětovné připojení přepíše URL. Cursor se NULUJE:
  // „Připojit" znamená založit zdroj nanovo, takže další sync backfilluje od začátku
  // (jinak by reconnect s jinou URL pokračoval od starého cursoru a historii vynechal).
  const connector = await prisma.connector.upsert({
    where: { projectId_type: { projectId, type } },
    update: { feedUrl, active: true, nazev: adapter.nazev, cursor: null },
    create: {
      projectId,
      type,
      kind: adapter.kind,
      nazev: adapter.nazev,
      feedUrl,
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user!.id,
      akce: "connector.connect",
      entita: `Connector:${connector.id}`,
      detail: { type, projectId },
    },
  });

  // Spustí backfill/sync na pozadí (dry-run v této dávce).
  await startConnectorSync(connector.id);

  revalidatePath("/integrace");
  return { ok: true };
}

/**
 * Připojí Sklik konektor API tokenem. Sklik je TOKEN-BASED (ne OAuth roundtrip),
 * proto se připojuje server akcí (ne redirectem): token (+ volitelně userId účtu)
 * uložíme ŠIFROVANĚ do credentialsEnc. Cursor se NULUJE (reconnect = nový backfill).
 */
export async function connectSklikAction(
  _prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const projectId = String(formData.get("projectId") ?? "");

  const { user, error } = await assertCanManage(projectId);
  if (error) return { error };

  const apiToken = String(formData.get("apiToken") ?? "").trim();
  if (!apiToken) return { error: "Zadejte Sklik API token." };
  const accountId = String(formData.get("accountId") ?? "").trim() || undefined;

  const adapter = getConnectorAdapter("sklik");
  if (!adapter) return { error: "Neznámý typ konektoru." };

  const credentialsEnc = encryptJson({ apiToken, accountId });
  // POZN.: syncStatus se zde NEResetuje — kdyby konektor zrovna běžel (`processing`),
  // přepis na `idle` by obešel atomický zábor `claimConnector` a spustil druhý
  // souběžný sync. Stav řeší až `startConnectorSync` (claim z jakéhokoli ne-processing).
  const connector = await prisma.connector.upsert({
    where: { projectId_type: { projectId, type: "sklik" } },
    update: {
      credentialsEnc,
      active: true,
      nazev: adapter.nazev,
      feedUrl: null,
      cursor: null,
      lastError: null,
    },
    create: {
      projectId,
      type: "sklik",
      kind: "oauth_api",
      nazev: adapter.nazev,
      credentialsEnc,
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user!.id,
      akce: "connector.connect",
      entita: `Connector:${connector.id}`,
      detail: { type: "sklik", projectId },
    },
  });

  await startConnectorSync(connector.id);

  revalidatePath("/integrace");
  return { ok: true };
}

/** Odpojí konektor a smaže jeho metriky (per projekt+zdroj). */
export async function disconnectConnectorAction(
  _prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const connectorId = String(formData.get("connectorId") ?? "");
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId },
    select: { id: true, projectId: true, type: true },
  });
  if (!connector) return { error: "Konektor nenalezen." };

  const { user, error } = await assertCanManage(connector.projectId);
  if (error) return { error };

  await prisma.metricFact.deleteMany({
    where: { projectId: connector.projectId, source: connector.type },
  });
  await prisma.connector.delete({ where: { id: connectorId } });

  await prisma.auditLog.create({
    data: {
      userId: user!.id,
      akce: "connector.disconnect",
      entita: `Connector:${connectorId}`,
      detail: { type: connector.type, projectId: connector.projectId },
    },
  });

  revalidatePath("/integrace");
  return { ok: true };
}

/** Ruční „Aktualizovat teď" — spustí sync na pozadí. */
export async function syncConnectorAction(
  _prev: ConnectorActionState,
  formData: FormData,
): Promise<ConnectorActionState> {
  const connectorId = String(formData.get("connectorId") ?? "");
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId },
    select: { id: true, projectId: true },
  });
  if (!connector) return { error: "Konektor nenalezen." };

  const { error } = await assertCanManage(connector.projectId);
  if (error) return { error };

  await startConnectorSync(connector.id);

  revalidatePath("/integrace");
  return { ok: true };
}
