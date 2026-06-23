import type { NextAuthConfig } from "next-auth";

// Edge-safe základní konfigurace (bez Prisma a bcryptu) — používá ji middleware.
// Providery a callbacky s DB jsou až v auth.ts (běží v Node runtime).
export const authConfig = {
  // Lokální prototyp běží na různých hostech (localhost, LAN IP u odběratele).
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    // Vynucení přihlášení na úrovni middleware. RBAC per modul/akci
    // se navíc kontroluje v server komponentách a akcích.
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // /login je veřejná; přihlášeného uživatele přesměrujeme na rozcestník.
      if (pathname.startsWith("/login")) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", request.nextUrl));
        }
        return true;
      }

      // Vše ostatní (dashboard) vyžaduje přihlášení.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
