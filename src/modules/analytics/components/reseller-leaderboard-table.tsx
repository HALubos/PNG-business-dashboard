"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  ArrowRight,
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

export interface ResellerRow {
  resellerId: string;
  domena: string;
  nazev: string | null;
  opportunityCount: number;
  opportunityValue: number;
  brandCount: number;
  categoryCount: number;
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

export function ResellerLeaderboardTable({
  rows,
  prevDate,
  canExport,
  exportQuery,
}: {
  rows: ResellerRow[];
  prevDate: string | null;
  canExport: boolean;
  exportQuery: string; // querystring s filtry (producer/kategorie)
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<ResellerRow>[]>(
    () => [
      {
        accessorKey: "domena",
        header: "Odběratel",
        cell: ({ row }) => (
          <Link
            href={`/skladovost?reseller=${row.original.resellerId}`}
            className="group min-w-[12rem]"
          >
            <div className="font-medium group-hover:underline">
              {row.original.domena}
            </div>
            {row.original.nazev && row.original.nazev !== row.original.domena ? (
              <div className="text-xs text-[var(--muted-foreground)]">
                {row.original.nazev}
              </div>
            ) : null}
          </Link>
        ),
      },
      {
        accessorKey: "opportunityCount",
        header: ({ column }) => (
          <SortButton
            label="Příležitostí"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => (
          <span className="tabular-nums font-medium">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: "opportunityValue",
        header: ({ column }) => (
          <SortButton
            label="Hodnota"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ getValue }) => czk.format(getValue<number>()),
      },
      {
        accessorKey: "brandCount",
        header: "Značky",
        cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
      },
      {
        accessorKey: "categoryCount",
        header: "Kategorie",
        cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
      },
      {
        accessorKey: "deltaCount",
        header: "Trend",
        cell: ({ getValue }) => (
          <TrendBadge delta={getValue<number | null>()} prevDate={prevDate} />
        ),
      },
      {
        id: "akce",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/skladovost?reseller=${row.original.resellerId}`}>
              Otevřít <ArrowRight className="size-4" />
            </Link>
          </Button>
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
        o.domena.toLowerCase().includes(q) ||
        (o.nazev ?? "").toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 15 },
      sorting: [{ id: "opportunityCount", desc: true }],
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
            placeholder="Hledat odběratele…"
            className="pl-9"
          />
        </div>
        {canExport ? (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/analytics/export?type=resellers&format=xlsx${exportQuery}`}>
                <FileSpreadsheet /> Export XLSX
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/analytics/export?type=resellers&format=csv${exportQuery}`}>
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
                  Žádní odběratelé neodpovídají filtru.
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
        <span>{table.getFilteredRowModel().rows.length} odběratelů</span>
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
