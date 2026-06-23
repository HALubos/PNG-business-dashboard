"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Radio,
  CircleSlash,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ResellerRow {
  id: string;
  domena: string;
  nazev: string | null;
  jeVlastni: boolean;
  feedUrl: string | null;
  feedFormat: string | null;
  feedRefreshedAt: string | null; // ISO
  feedItems: number | null;
  feedStatus: string | null; // processing | ok | error
}

function FeedStatus({ r }: { r: ResellerRow }) {
  if (!r.feedUrl) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)]">
        <CircleSlash className="size-3.5" /> bez feedu
      </span>
    );
  }
  if (r.feedStatus === "processing") {
    return (
      <Badge variant="secondary">
        <Loader2 className="mr-1 size-3 animate-spin" /> zpracovává se
      </Badge>
    );
  }
  if (r.feedStatus === "error") {
    return (
      <Badge variant="warning">
        <AlertTriangle className="mr-1 size-3" /> chyba
      </Badge>
    );
  }
  if (!r.feedRefreshedAt) {
    return (
      <Badge variant="warning">
        <Radio className="mr-1 size-3" /> nastaveno (neaktualizováno)
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Badge variant="success">
        <Radio className="mr-1 size-3" /> aktivní
      </Badge>
      <span className="text-[var(--muted-foreground)]">
        {new Date(r.feedRefreshedAt).toLocaleDateString("cs-CZ")} ·{" "}
        {r.feedItems ?? 0} pol.
      </span>
    </span>
  );
}

export function ResellersTable({ rows }: { rows: ResellerRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.domena.toLowerCase().includes(s) ||
        (r.nazev ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  return (
    <div className="space-y-3">
      <div className="relative sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat odběratele…"
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doména</TableHead>
              <TableHead>Název</TableHead>
              <TableHead>Vlastní</TableHead>
              <TableHead>Feed</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-[var(--muted-foreground)]"
                >
                  Žádní odběratelé neodpovídají hledání.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/odberatele/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.domena}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {r.nazev ?? "—"}
                  </TableCell>
                  <TableCell>
                    {r.jeVlastni ? <Badge variant="secondary">vlastní</Badge> : "—"}
                  </TableCell>
                  <TableCell>
                    <FeedStatus r={r} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/odberatele/${r.id}`}
                      className="inline-flex items-center text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      Detail <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-[var(--muted-foreground)]">
        {filtered.length} odběratelů
      </p>
    </div>
  );
}
