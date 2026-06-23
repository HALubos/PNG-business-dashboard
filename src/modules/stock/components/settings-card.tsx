"use client";

import { useActionState } from "react";
import { Settings2, CheckCircle2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  KNOWN_AVAILABILITY_STATES,
  availabilityLabel,
} from "@/modules/stock/constants";
import {
  updateConfigAction,
  type ConfigActionState,
} from "@/app/(dashboard)/skladovost/actions";

const initial: ConfigActionState = {};

export function SettingsCard({
  availableStates,
  stockThreshold,
}: {
  availableStates: string[];
  stockThreshold: number;
}) {
  const [state, formAction, pending] = useActionState(
    updateConfigAction,
    initial,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="size-4" /> Nastavení modulu
        </CardTitle>
        <CardDescription>
          Co se počítá za dostupné u odběratele (vše ostatní = příležitost) a
          minimální náš sklad.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Dostupné stavy</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {KNOWN_AVAILABILITY_STATES.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="availableStates"
                    value={s}
                    defaultChecked={availableStates.includes(s)}
                    className="size-4"
                  />
                  {availabilityLabel(s)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div>
              <label
                htmlFor="stockThreshold"
                className="mb-1 block text-sm font-medium"
              >
                Náš sklad musí být &gt;
              </label>
              <Input
                id="stockThreshold"
                name="stockThreshold"
                type="number"
                min={0}
                defaultValue={stockThreshold}
                className="w-28"
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Uložit nastavení"}
            </Button>
            {state.ok ? (
              <span className="flex items-center gap-1 text-sm text-[var(--success)]">
                <CheckCircle2 className="size-4" /> Uloženo
              </span>
            ) : null}
            {state.error ? (
              <span className="text-sm text-[var(--destructive)]">
                {state.error}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
