"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { emptyFormState, type FormState } from "@/lib/auth/form-state";

export type AuthField = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  /** Texto corto de ayuda debajo del campo. */
  hint?: string;
  maxLength?: number;
};

type AuthFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  fields: AuthField[];
  submitLabel: string;
  pendingLabel: string;
};

/** Formulario de las pantallas de cuenta: una tarjeta con los campos y el botón principal. */
export function AuthForm({ action, fields, submitLabel, pendingLabel }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, emptyFormState);
  const [showPassword, setShowPassword] = useState(false);
  const formId = useId();

  if (state.ok) {
    return (
      <p role="status" className="rounded-lg bg-card p-5 leading-normal">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col rounded-[24px] bg-card px-5">
        {fields.map((field, index) => {
          const inputId = `${formId}-${field.name}`;
          const error = state.errors?.[field.name];
          const describedBy = error
            ? `${inputId}-error`
            : field.hint
              ? `${inputId}-hint`
              : undefined;
          const isPassword = field.type === "password";

          return (
            <div
              key={field.name}
              className={`flex flex-col gap-1 py-3.5 ${index > 0 ? "border-t border-border" : ""}`}
            >
              <label htmlFor={inputId} className="text-[13px] text-muted-foreground">
                {field.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={inputId}
                  name={field.name}
                  type={isPassword && showPassword ? "text" : field.type}
                  autoComplete={field.autoComplete}
                  autoCapitalize={field.type === "text" ? "words" : "none"}
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={field.maxLength}
                  required
                  defaultValue={isPassword ? undefined : state.values?.[field.name]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                  className="h-8 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
                />
                {isPassword && (
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={showPassword}
                    className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-5" />
                    ) : (
                      <Eye aria-hidden="true" className="size-5" />
                    )}
                  </button>
                )}
              </div>
              {error ? (
                <p id={`${inputId}-error`} className="text-[13px] text-gasto">
                  {error}
                </p>
              ) : (
                field.hint && (
                  <p id={`${inputId}-hint`} className="text-[13px] text-muted-foreground">
                    {field.hint}
                  </p>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Siempre presente para que el lector de pantalla anuncie el error cuando aparezca. */}
      <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
        {state.message}
      </p>

      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
