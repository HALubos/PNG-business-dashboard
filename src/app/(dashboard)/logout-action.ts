"use server";

import { signOut } from "@/core/auth/auth";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
