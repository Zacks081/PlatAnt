"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money-input";

/**
 * Piezas de formulario de la app: una tarjeta con filas, como en los mockups.
 * Cada fila lleva su etiqueta a la izquierda y el valor a la derecha.
 */

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Tarjeta que agrupa las filas de un formulario. */
export function FieldCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
      {children}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="pb-3 text-[13px] text-gasto">
      {message}
    </p>
  );
}

type RowProps = { label: string; htmlFor: string; error?: string; children: ReactNode };

function Row({ label, htmlFor, error, children }: RowProps) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-14 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="shrink-0 text-muted-foreground">
          {label}
        </label>
        {children}
      </div>
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  );
}

const rowInputClass =
  "h-11 min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground";

type TextRowProps = {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "decimal";
  error?: string;
  /** Texto pegado al final del valor, como «%». */
  suffix?: string;
};

/** Fila para escribir un texto corto o un número que no es plata. */
export function TextRow({
  name,
  label,
  error,
  suffix,
  inputMode = "text",
  ...input
}: TextRowProps) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id} error={error}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={rowInputClass}
        {...input}
      />
      {suffix && <span className="font-semibold">{suffix}</span>}
    </Row>
  );
}

/** Lo que comparten los dos campos de plata: se escribe con el teclado numérico y se ve con puntos de miles. */
function useMoneyText(
  defaultValue: string | number | null | undefined,
  onValueChange?: (amount: number | null) => void,
) {
  const [text, setText] = useState(() => formatMoneyInput(defaultValue));
  return {
    text,
    onChange: (value: string) => {
      setText(formatMoneyInput(value));
      onValueChange?.(parseMoneyInput(value));
    },
  };
}

type MoneyRowProps = {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  error?: string;
  /** Avisa el monto cada vez que cambia, para cálculos en vivo. */
  onValueChange?: (amount: number | null) => void;
};

/** Fila para un valor en pesos. */
export function MoneyRow({ name, label, defaultValue, error, onValueChange }: MoneyRowProps) {
  const id = useId();
  const money = useMoneyText(defaultValue, onValueChange);
  return (
    <Row label={label} htmlFor={id} error={error}>
      <span aria-hidden="true" className="font-semibold text-muted-foreground">
        $
      </span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        value={money.text}
        onChange={(event) => money.onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(rowInputClass, "max-w-40 flex-none")}
      />
    </Row>
  );
}

type HeroMoneyProps = {
  name: string;
  /** Qué valor es; lo lee el lector de pantalla. */
  label: string;
  defaultValue?: string | number | null;
  /** Verde si es plata a favor, coral si es plata que sale. */
  tone: "libre" | "gasto";
  error?: string;
  /** Avisa el monto cada vez que cambia, para cálculos en vivo. */
  onValueChange?: (amount: number | null) => void;
};

/** El valor principal de una pantalla: grande, arriba y con el teclado numérico. */
export function HeroMoney({
  name,
  label,
  defaultValue,
  tone,
  error,
  onValueChange,
}: HeroMoneyProps) {
  const id = useId();
  const money = useMoneyText(defaultValue, onValueChange);
  // El campo crece con lo escrito, para que la cifra quede centrada junto al signo.
  const width = `${Math.max(1, money.text.length || 1)}ch`;

  return (
    <div className="flex flex-col items-center gap-1">
      <label
        htmlFor={id}
        className="flex h-[72px] max-w-full cursor-text items-center justify-center gap-2 font-display leading-none font-bold tracking-[-0.03em]"
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={cn("text-[38px]", tone === "libre" ? "text-libre" : "text-gasto")}
        >
          $
        </span>
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={money.text}
          onChange={(event) => money.onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          style={{ width }}
          className={cn(
            "max-w-[calc(100%-3rem)] min-w-[1ch] bg-transparent text-[clamp(36px,13vw,58px)] tabular-nums outline-none placeholder:text-muted-foreground",
            tone === "libre" ? "caret-libre" : "caret-gasto",
          )}
        />
      </label>
      {error && (
        <p id={`${id}-error`} className="text-center text-[13px] text-gasto">
          {error}
        </p>
      )}
    </div>
  );
}

export type Option = { value: string; label: string };

type SelectRowProps = {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string;
  /** Texto de la opción vacía; si falta, siempre hay una elegida. */
  placeholder?: string;
  error?: string;
  onValueChange?: (value: string) => void;
};

/** Fila con la lista desplegable del propio celular. */
export function SelectRow({
  name,
  label,
  options,
  defaultValue,
  placeholder,
  error,
  onValueChange,
}: SelectRowProps) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id} error={error}>
      <span className="relative flex min-w-0 items-center">
        <select
          id={id}
          name={name}
          defaultValue={defaultValue ?? (placeholder ? "" : undefined)}
          onChange={onValueChange && ((event) => onValueChange(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "h-11 max-w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg bg-transparent pr-6 pl-2 text-right font-semibold",
            focusRing,
          )}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-popover text-foreground">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-0 size-[18px] text-muted-foreground"
        />
      </span>
    </Row>
  );
}

type SegmentedRowProps = {
  name: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
};

/** Fila para elegir entre dos o tres opciones a la vista. La elegida va en blanco. */
export function SegmentedRow({ name, label, options, value, onChange }: SegmentedRowProps) {
  return (
    <fieldset className="flex min-h-16 min-w-0 items-center justify-between gap-3">
      <legend className="float-left shrink-0 text-muted-foreground">{label}</legend>
      <div className="flex rounded-full bg-background p-[3px]">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex h-[38px] cursor-pointer items-center rounded-full px-3.5 font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              option.value === value ? "bg-foreground text-background" : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Las opciones «1» a «31» para elegir un día del mes. */
export function dayOptions(prefix = ""): Option[] {
  return Array.from({ length: 31 }, (_, index) => {
    const day = String(index + 1);
    return { value: day, label: `${prefix}${day}` };
  });
}
