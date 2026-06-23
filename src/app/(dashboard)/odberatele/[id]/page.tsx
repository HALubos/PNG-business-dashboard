import Link from "next/link";
import { notFound } from "next/navigation";
import { Store, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { canViewReseller } from "@/modules/stock/reseller-scope";
import { prisma } from "@/lib/prisma";
import { FEED_FORMATS } from "@/modules/resellers/feed/formats";
import { ResellerEditForm } from "@/modules/resellers/components/reseller-edit-form";

const RESELLERS_VIEWALL = "resellers.viewall";

export default async function ResellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission("resellers.view");
  if (!(await canViewReseller(user, id, RESELLERS_VIEWALL))) notFound();

  const reseller = await prisma.reseller.findUnique({
    where: { id },
    select: {
      id: true,
      domena: true,
      nazev: true,
      jeVlastni: true,
      feedUrl: true,
      feedFormat: true,
      feedConfig: true,
      feedRefreshedAt: true,
      feedItems: true,
    },
  });
  if (!reseller) notFound();

  const canEdit = can(user, "resellers.edit");
  const formatOptions = FEED_FORMATS.map((f) => ({ key: f.key, label: f.label }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/odberatele">
            <ArrowLeft className="size-4" /> Zpět na odběratele
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
            <Store className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{reseller.domena}</h1>
            <p className="text-[var(--muted-foreground)]">
              {reseller.nazev ?? "Karta odběratele"}
            </p>
          </div>
        </div>
      </div>

      <ResellerEditForm
        reseller={{
          id: reseller.id,
          domena: reseller.domena,
          nazev: reseller.nazev,
          jeVlastni: reseller.jeVlastni,
          feedUrl: reseller.feedUrl,
          feedFormat: reseller.feedFormat,
          feedConfig: reseller.feedConfig
            ? JSON.stringify(reseller.feedConfig, null, 2)
            : "",
          feedRefreshedAt: reseller.feedRefreshedAt?.toISOString() ?? null,
          feedItems: reseller.feedItems,
        }}
        formatOptions={formatOptions}
        canEdit={canEdit}
      />
    </div>
  );
}
