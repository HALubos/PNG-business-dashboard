"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUp,
  ArrowDown,
  Minus,
  Pause,
  Ban,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BiddingAction, BiddingProposal } from "@/modules/mkt_bidding/engine";

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});
const cpcFmt = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("cs-CZ");

const fmtCpc = (v: number | null) => (v == null ? "—" : `${cpcFmt.format(v)} Kč`);
const fmtPct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;

const ACTION_META: Record<
  BiddingAction,
  { label: string; icon: typeof ArrowUp; cls: string; row: string }
> = {
  increase: { label: "Zvýšit", icon: ArrowUp, cls: "text-[var(--success)]", row: "border-l-[var(--success)]" },
  decrease: { label: "Snížit", icon: ArrowDown, cls: "text-amber-600", row: "border-l-amber-500" },
  pause: { label: "Pauza", icon: Pause, cls: "text-[var(--destructive)]", row: "border-l-[var(--destructive)]" },
  keep: { label: "Beze změny", icon: Minus, cls: "text-[var(--muted-foreground)]", row: "border-l-transparent" },
  skip: { label: "Bez bidu", icon: Ban, cls: "text-[var(--muted-foreground)]", row: "border-l-transparent" },
};

function SortButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium hover:text-[var(--foreground)]"
    >
      {label}
      <ArrowUpDown className="size-3.5 opacity-50" />
    </button>
  );
}

export function BiddingTable({ rows }: { rows: BiddingProposal[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<BiddingProposal>[]>(
    () => [
      {
        id: "action",
        header: "Akce",
        accessorFn: (r) => r.action,
        cell: ({ row }) => {
          const meta = ACTION_META[row.original.action];
          const Icon = meta.icon;
          return (
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.cls)}>
              <Icon className="size-3.5" /> {meta.label}
            </span>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Produkt",
        cell: ({ row }) => (
          <div className="min-w-[12rem]">
            <div className="font-medium">{row.original.name ?? "—"}</div>
            <div className="font-mono text-xs text-[var(--muted-foreground)]">
              {row.original.itemId}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "internalCategory",
        header: "Kategorie",
        cell: ({ getValue }) => (
          <span className="text-xs text-[var(--muted-foreground)]">
            {getValue<string | null>() ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "price",
        header: "Cena",
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v == null ? "—" : czk.format(v);
        },
      },
      {
        accessorKey: "clicks",
        header: ({ column }) => (
          <SortButton
            label="Prokliky"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => <span className="tabular-nums">{num.format(getValue<number>())}</span>,
      },
      {
        accessorKey: "cost",
        header: ({ column }) => (
          <SortButton
            label="Náklad"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => czk.format(getValue<number>()),
      },
      {
        accessorKey: "orders",
        header: "Obj.",
        cell: ({ getValue }) => <span className="tabular-nums">{num.format(getValue<number>())}</span>,
      },
      {
        accessorKey: "revenue",
        header: "Obrat",
        cell: ({ getValue }) => czk.format(getValue<number>()),
      },
      {
        accessorKey: "pno",
        header: "PNO",
        cell: ({ getValue }) => fmtPct(getValue<number | null>()),
      },
      {
        accessorKey: "phase",
        header: "Fáze",
        cell: ({ getValue }) => (
          <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 text-xs font-medium">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: "cpc",
        header: "Staré → navržené CPC",
        cell: ({ row }) => (
          <div className="whitespace-nowrap tabular-nums">
            <span className="text-[var(--muted-foreground)]">{fmtCpc(row.original.currentCpc)}</span>
            <span className="mx-1">→</span>
            <span className="font-semibold">{fmtCpc(row.original.proposedCpc)}</span>
          </div>
        ),
      },
      {
        accessorKey: "changePct",
        header: "Δ %",
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          if (v == null) return "—";
          const cls = v > 0 ? "text-[var(--success)]" : v < 0 ? "text-amber-600" : "";
          return <span className={cn("tabular-nums", cls)}>{fmtPct(v)}</span>;
        },
      },
      {
        accessorKey: "reason",
        header: "Důvod",
        cell: ({ getValue }) => (
          <span className="text-xs text-[var(--muted-foreground)]">{getValue<string>()}</span>
        ),
      },
    ],
    [],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table je s React Compilerem v pořádku
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _id, value) => {
      const q = String(value).toLowerCase();
      const o = row.original;
      return (
        (o.name ?? "").toLowerCase().includes(q) ||
        o.itemId.toLowerCase().includes(q) ||
        (o.internalCategory ?? "").toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div className="space-y-3">
      <div className="relative sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Hledat název, SKU, kategorii…"
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-[var(--muted-foreground)]"
                >
                  Žádné produkty neodpovídají filtru.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn("border-l-2", ACTION_META[row.original.action].row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <span>{table.getFilteredRowModel().rows.length} produktů</span>
        <div className="flex items-center gap-2">
          <span>
            Strana {table.getState().pagination.pageIndex + 1} z {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Předchozí"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Další"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
