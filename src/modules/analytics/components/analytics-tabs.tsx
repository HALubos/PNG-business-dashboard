"use client";

import { useState } from "react";
import { Users, Package } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ResellerLeaderboardTable,
  type ResellerRow,
} from "./reseller-leaderboard-table";
import { TopProductsTable, type ProductRow } from "./top-products-table";

type Tab = "resellers" | "products";

export function AnalyticsTabs({
  resellers,
  products,
  prevDate,
  canExport,
  exportQuery,
}: {
  resellers: ResellerRow[];
  products: ProductRow[];
  prevDate: string | null;
  canExport: boolean;
  exportQuery: string;
}) {
  const [tab, setTab] = useState<Tab>("resellers");

  const tabs: { key: Tab; label: string; count: number; icon: typeof Users }[] = [
    { key: "resellers", label: "Koho oslovit", count: resellers.length, icon: Users },
    { key: "products", label: "Co tlačit", count: products.length, icon: Package },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
            >
              <Icon className="size-4" />
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active
                    ? "bg-[var(--primary-foreground)]/20"
                    : "bg-[var(--secondary)]",
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "resellers" ? (
        <ResellerLeaderboardTable
          rows={resellers}
          prevDate={prevDate}
          canExport={canExport}
          exportQuery={exportQuery}
        />
      ) : (
        <TopProductsTable
          rows={products}
          prevDate={prevDate}
          canExport={canExport}
          exportQuery={exportQuery}
        />
      )}
    </div>
  );
}
