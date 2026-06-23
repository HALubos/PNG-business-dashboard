"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AnalyticsFilters({
  producers,
  producer,
  kategorie,
}: {
  producers: string[];
  producer: string;
  kategorie: string;
}) {
  const router = useRouter();
  const [p, setP] = useState(producer);
  const [k, setK] = useState(kategorie);

  function apply() {
    const params = new URLSearchParams();
    if (p) params.set("producer", p);
    if (k.trim()) params.set("kategorie", k.trim());
    const qs = params.toString();
    router.push(qs ? `/analytika?${qs}` : "/analytika");
  }

  function reset() {
    setP("");
    setK("");
    router.push("/analytika");
  }

  const hasFilter = producer !== "" || kategorie !== "";

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
          Značka
        </label>
        <select
          value={p}
          onChange={(e) => setP(e.target.value)}
          className="h-10 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
        >
          <option value="">Všechny značky</option>
          {producers.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
          Kategorie (obsahuje)
        </label>
        <Input
          value={k}
          onChange={(e) => setK(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="např. batoh"
          className="w-48"
        />
      </div>
      <Button type="button" onClick={apply}>
        <Filter className="size-4" /> Použít
      </Button>
      {hasFilter ? (
        <Button type="button" variant="ghost" onClick={reset}>
          <X className="size-4" /> Zrušit
        </Button>
      ) : null}
    </div>
  );
}
