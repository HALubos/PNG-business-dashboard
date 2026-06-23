import { Users, Shield, Boxes, ScrollText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  // Vynuceno na backendu: vstup do administrace vyžaduje admin.view.
  await requirePermission("admin.view");

  const [users, roles, modules, audit] = await Promise.all([
    prisma.user.findMany({
      include: { role: true, _count: { select: { repCustomers: true } } },
      orderBy: { vytvoreno: "asc" },
    }),
    prisma.role.findMany({
      include: { _count: { select: { permissions: true, users: true } } },
      orderBy: { nazev: "asc" },
    }),
    prisma.module.findMany({ orderBy: { poradi: "asc" } }),
    prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { cas: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administrace</h1>
        <p className="text-[var(--muted-foreground)]">
          Přehled uživatelů, rolí, modulů a poslední aktivity. (Editace přijde
          v dalších iteracích.)
        </p>
      </div>

      {/* Uživatelé */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" /> Uživatelé
          </CardTitle>
          <CardDescription>{users.length} uživatelů v systému.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jméno</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Odběratelé</TableHead>
                <TableHead>Stav</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.jmeno}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{u.role.nazev}</Badge>
                  </TableCell>
                  <TableCell>{u._count.repCustomers}</TableCell>
                  <TableCell>
                    {u.aktivni ? (
                      <Badge variant="success">aktivní</Badge>
                    ) : (
                      <Badge variant="outline">neaktivní</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Role */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5" /> Role a práva
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Práv</TableHead>
                  <TableHead>Uživatelů</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nazev}</TableCell>
                    <TableCell>{r._count.permissions}</TableCell>
                    <TableCell>{r._count.users}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Moduly */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="size-5" /> Moduly
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Klíč</TableHead>
                  <TableHead>Název</TableHead>
                  <TableHead>Stav</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modules.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">
                      {m.klic}
                    </TableCell>
                    <TableCell>{m.nazev}</TableCell>
                    <TableCell>
                      {m.aktivni ? (
                        <Badge variant="success">aktivní</Badge>
                      ) : (
                        <Badge variant="outline">vypnutý</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-5" /> Poslední aktivita
          </CardTitle>
          <CardDescription>Posledních 10 záznamů auditu.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Čas</TableHead>
                <TableHead>Uživatel</TableHead>
                <TableHead>Akce</TableHead>
                <TableHead>Entita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-[var(--muted-foreground)]"
                  >
                    Zatím žádné záznamy.
                  </TableCell>
                </TableRow>
              ) : (
                audit.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {a.cas.toLocaleString("cs-CZ")}
                    </TableCell>
                    <TableCell>{a.user?.jmeno ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.akce}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-[var(--muted-foreground)]">
                      {a.entita ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
