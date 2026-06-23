import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "./password";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "E-mail a heslo",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Heslo", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
            repCustomers: true,
          },
        });
        if (!user || !user.aktivni) return null;

        const ok = await verifyPassword(password, user.hesloHash);
        if (!ok) return null;

        // Audit přihlášení.
        await prisma.auditLog.create({
          data: { userId: user.id, akce: "login", entita: "User:" + user.id },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.jmeno,
          jmeno: user.jmeno,
          roleName: user.role.nazev,
          permissions: user.role.permissions.map((rp) => rp.permission.klic),
          resellerIds: user.repCustomers.map((rc) => rc.resellerId),
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.jmeno = user.jmeno;
        token.roleName = user.roleName;
        token.permissions = user.permissions;
        token.resellerIds = user.resellerIds;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const t = token as {
          id: string;
          jmeno: string;
          roleName: string;
          permissions: string[];
          resellerIds: string[];
        };
        session.user.id = t.id;
        session.user.jmeno = t.jmeno;
        session.user.roleName = t.roleName;
        session.user.permissions = t.permissions;
        session.user.resellerIds = t.resellerIds;
      }
      return session;
    },
  },
});
