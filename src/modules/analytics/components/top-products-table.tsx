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
  FileSpreadsheet,
  FileDown,
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
import { TrendBadge } from "./trend-badge";

export interface ProductRow {
  productId: string;
  ean: string;
  nazev: string;
  size: string | null;
  producer: string | null;
  kategorie: string | null;
  ourStock: number;
  stock7d: number | null;
  resellerCount: number;
  value: number;
  domeny: string[];
  deltaCount: number | null;
}

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

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

export function TopProductsTable({
  rows,
  prevDate,
  canExport,
  exportQuery,
}: {
  rows: ProductRow[];
  prevDate: string | null;
  canExport: boolean;
  exportQuery: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<ProductRow>[]>(
    () => [
      {
        accessorKey: "nazev",
        header: "Produkt",
        cell: ({ row }) => (
          <div className="min-w-[14rem]">
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
        accessorKey: "ourStock",
        header: ({ column }) => (
          <SortButton
            label="Náš sklad"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div className="tabular-nums">
            <div>{row.original.ourStock} ks</div>
            {row.original.stock7d && row.original.stock7d > 0 ? (
              <div className="text-xs font-normal text-[var(--muted-foreground)]">
                +{row.original.stock7d} do 7 dnů
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "resellerCount",
        header: ({ column }) => (
          <SortButton
            label="U odběratelů"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <span
            className="tabular-nums font-medium"
            title={row.original.domeny.join(", ")}
          >
            {row.original.resellerCount}
          </span>
        ),
      },
      {
        accessorKey: "value",
        header: ({ column }) => (
          <SortButton
            label="Hodnota"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => czk.format(getValue<number>()),
      },
      {
        accessorKey: "deltaCount",
        header: "Trend",
        cell: ({ getValue }) => (
          <TrendBadge delta={getValue<number | null>()} prevDate={prevDate} />
        ),
      },
    ],
    [prevDate],
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
        o.nazev.toLowerCase().includes(q) ||
        o.ean.toLowerCase().includes(q) ||
        (o.kategorie ?? "").toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 20 },
      sorting: [{ id: "resellerCount", desc: true }],
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Hledat název, EAN, kategorii…"
            className="pl-9"
          />
        </div>
        {canExport ? (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/analytics/export?type=products&format=xlsx${exportQuery}`}>
                <FileSpreadsheet /> Export XLSX
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/analytics/export?type=products&format=csv${exportQuery}`}>
                <FileDown /> CSV
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-[var(--border)]">
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

      <div className="flex items-center justify-between text-sm text-[var(--muted-foreground)]">
        <span>{table.getFilteredRowModel().rows.length} produktů</span>
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
