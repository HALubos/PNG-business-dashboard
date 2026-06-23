import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/core/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Přihlášeného uživatele rovnou na rozcestník.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Obchodní dashboard</CardTitle>
        <CardDescription>
          ACTIVENT365 · přihlaste se svým e-mailem a heslem.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
