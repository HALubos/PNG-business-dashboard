import type { DefaultSession } from "next-auth";

// Rozšíření typů Auth.js o naše pole (role, oprávnění, přiřazení odběratelé).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      jmeno: string;
      roleName: string;
      permissions: string[];
      resellerIds: string[];
    } & DefaultSession["user"];
  }

  interface User {
    jmeno: string;
    roleName: string;
    permissions: string[];
    resellerIds: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    jmeno: string;
    roleName: string;
    permissions: string[];
    resellerIds: string[];
  }
}
