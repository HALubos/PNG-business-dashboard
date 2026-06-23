"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Search, Store } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ResellerPickerItem {
  id: string;
  domena: string;
  nazev: string | null;
}

export function ResellerPicker({
  resellers,
  selectedId,
}: {
  resellers: ResellerPickerItem[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = resellers.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = resellers.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.domena.toLowerCase().includes(q) ||
      (r.nazev ?? "").toLowerCase().includes(q)
    );
  });

  function choose(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/skladovost?reseller=${encodeURIComponent(id)}`);
  }

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          <Store className="size-4 shrink-0 text-[var(--muted-foreground)]" />
          {selected ? selected.domena : "Vyberte odběratele…"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>

      {open ? (
        <div className="absolute z-40 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--popover)] shadow-md">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
            <Search className="size-4 text-[var(--muted-foreground)]" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat doménu…"
              className="border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <ul className="max-h-64 overflow-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[var(--muted-foreground)]">
                Nic nenalezeno.
              </li>
            ) : (
              filtered.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => choose(r.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-[var(--accent)]",
                      r.id === selectedId && "bg-[var(--accent)]",
                    )}
                  >
                    <span className="truncate">{r.domena}</span>
                    {r.id === selectedId ? <Check className="size-4" /> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
            {resellers.length} odběratelů
          </div>
        </div>
      ) : null}
    </div>
  );
}
