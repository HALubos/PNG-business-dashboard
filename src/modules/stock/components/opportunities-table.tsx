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
  RotateCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { availabilityLabel } from "@/modules/stock/constants";

export interface OpportunityRow {
  productId: string;
  ean: string;
  nazev: string;
  size: string | null;
  producer: string | null;
  kategorie: string | null;
  ourStock: number;
  stock7d?: number | null;
  salePrice: number | null;
  resellerCena: number | null;
  availability: string | null;
  resellerHas?: boolean;
  isRestockCandidate?: boolean;
}

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});
const money = (v: number | null) => (v == null ? "—" : czk.format(v));

function SortButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
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

export function OpportunitiesTable({
  rows,
  muted = false,
  showRestock = false,
}: {
  rows: OpportunityRow[];
  /** Šedé podbarvení (sekce „už má skladem" / „vyprodáno u nás"). */
  muted?: boolean;
  /** Zvýraznit restock kandidáty (blok „vyprodáno u nás"). */
  showRestock?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [producer, setProducer] = useState<string>("");

  const producers = useMemo(
    () =>
      [...new Set(rows.map((r) => r.producer).filter(Boolean))].sort() as string[],
    [rows],
  );

  const filteredRows = useMemo(
    () => (producer ? rows.filter((r) => r.producer === producer) : rows),
    [rows, producer],
  );

  const columns = useMemo<ColumnDef<OpportunityRow>[]>(
    () => [
      {
        accessorKey: "nazev",
        header: ({ column }) => (
          <SortButton
            label="Produkt"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-[16rem]">
            <div className="font-medium">{row.original.nazev}</div>
            {row.original.size ? (
              <div className="text-xs text-[var(--muted-foreground)]">
                {row.original.size}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "ean",
        header: "EAN",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "producer",
        header: "Značka",
        cell: ({ getValue }) => getValue<string>() ?? "—",
      },
      {
        accessorKey: "kategorie",
        header: "Kategorie",
        cell: ({ getValue }) => (
          <span className="text-xs text-[var(--muted-foreground)]">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "salePrice",
        header: ({ column }) => (
          <SortButton
            label="Naše cena"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => money(getValue<number | null>()),
      },
      {
        accessorKey: "ourStock",
        header: ({ column }) => (
          <SortButton
            label="Náš sklad"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="tabular-nums">
              <div>{o.ourStock} ks</div>
              {o.stock7d && o.stock7d > 0 ? (
                <div className="text-xs font-normal text-[var(--muted-foreground)]">
                  +{o.stock7d} do 7 dnů
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "availability",
        header: "Stav u odběratele",
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant={o.resellerHas ? "success" : "warning"}>
                {availabilityLabel(o.availability)}
              </Badge>
              {showRestock && o.isRestockCandidate ? (
                <Badge variant="secondary" className="gap-1">
                  <RotateCw className="size-3" /> restock
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "resellerCena",
        header: "Cena odběratele",
        cell: ({ getValue }) => money(getValue<number | null>()),
      },
    ],
    [showRestock],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table je s React Compilerem v pořádku
  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _id, value) => {
      const q = String(value).toLowerCase();
      const o = row.original;
      return (
        o.nazev.toLowerCase().includes(q) ||
        o.ean.toLowerCase().includes(q) ||
        (o.kategorie ?? "").toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const totalShown = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-3">
      {/* Filtry */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Hledat název, EAN, kategorii…"
            className="pl-9"
          />
        </div>
        <select
          value={producer}
          onChange={(e) => setProducer(e.target.value)}
          className="h-10 rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
        >
          <option value="">Všechny značky</option>
          {producers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div
        className={cn(
          "rounded-lg border border-[var(--border)]",
          muted && "bg-[var(--muted)]/30 text-[var(--muted-foreground)]",
        )}
      >
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
                  Žádné příležitosti neodpovídají filtru.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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

      {/* Stránkování */}
      <div className="flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <span>{totalShown} příležitostí</span>
        <div className="flex items-center gap-2">
          <span>
            Strana {table.getState().pagination.pageIndex + 1} z{" "}
            {table.getPageCount() || 1}
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
