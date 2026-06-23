"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "@/core/auth/auth";

const schema = z.object({
  email: z.string().email("Zadejte platný e-mail."),
  password: z.string().min(1, "Zadejte heslo."),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatný vstup." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: "/",
    });
    return {};
  } catch (error) {
    // signIn vyhazuje redirect (NEXT_REDIRECT) při úspěchu — ten musí projít dál.
    if (error instanceof AuthError) {
      return { error: "Neplatný e-mail nebo heslo." };
    }
    throw error;
  }
}
