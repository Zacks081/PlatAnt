"use client";

import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { Sheet } from "@/components/forms/sheet";
import { appConfig } from "@/config/app";
import {
  compareDates,
  daysInMonth,
  formatIsoDate,
  parseIsoDate,
  type CalendarDate,
} from "@/lib/dates";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money-input";
import { formatLongDate } from "@/lib/onboarding/labels";
import { cn } from "@/lib/utils";

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

type RowProps = {
  label: string;
  /** Id del control, para unirlo a la etiqueta. */
  htmlFor?: string;
  /** Id de la etiqueta, cuando el control es un grupo y no un solo campo. */
  labelId?: string;
  errorId: string;
  error?: string;
  children: ReactNode;
};

function Row({ label, htmlFor, labelId, errorId, error, children }: RowProps) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-14 items-center justify-between gap-3">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="shrink-0 text-muted-foreground">
            {label}
          </label>
        ) : (
          <span id={labelId} className="shrink-0 text-muted-foreground">
            {label}
          </span>
        )}
        {children}
      </div>
      <FieldError id={errorId} message={error} />
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
  /** Avisa lo escrito cada vez que cambia. */
  onValueChange?: (value: string) => void;
  readOnly?: boolean;
};

/** Fila para escribir un texto corto o un número que no es plata. */
export function TextRow({
  name,
  label,
  error,
  suffix,
  inputMode = "text",
  onValueChange,
  ...input
}: TextRowProps) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id} errorId={`${id}-error`} error={error}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={onValueChange && ((event) => onValueChange(event.target.value))}
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
    <Row label={label} htmlFor={id} errorId={`${id}-error`} error={error}>
      {/* El signo va pegado a la cifra: el campo solo ocupa lo que mide el texto. */}
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-text items-center justify-end gap-1 font-semibold"
      >
        <span aria-hidden="true" className="text-muted-foreground">
          $
        </span>
        <AutoSizeInput
          id={id}
          name={name}
          value={money.text}
          onChange={money.onChange}
          error={error}
          className="h-11 tabular-nums placeholder:font-normal placeholder:text-muted-foreground"
        />
      </label>
    </Row>
  );
}

type AutoSizeInputProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
  autoFocus?: boolean;
};

/**
 * Campo numérico que mide exactamente lo que mide su texto. Debajo hay una copia invisible
 * del texto que le da el ancho, así ninguna cifra se corta sin importar la letra.
 */
/** Posición en el texto justo después de `count` dígitos (los puntos no cuentan). */
function positionAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (/\d/.test(text[index]) && ++seen === count) return index + 1;
  }
  return text.length;
}

function AutoSizeInput({
  id,
  name,
  value,
  onChange,
  error,
  className,
  autoFocus,
}: AutoSizeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Cuántos dígitos deben quedar a la izquierda del cursor después de volver a poner los puntos.
  const caretDigits = useRef<number | null>(null);

  // Al reescribir el valor con puntos de miles, el navegador manda el cursor al final.
  // Aquí se vuelve a poner donde estaba, contando dígitos y no letras.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caretDigits.current === null || !input || document.activeElement !== input) return;
    const position = positionAfterDigits(value, caretDigits.current);
    input.setSelectionRange(position, position);
    caretDigits.current = null;
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    let digits = raw.replace(/\D/g, "");
    let before = raw.slice(0, caret).replace(/\D/g, "").length;

    // Si se borró un punto, en realidad se quería borrar el número que está al lado.
    const previousDigits = value.replace(/\D/g, "");
    const inputType = (event.nativeEvent as InputEvent).inputType;
    if (digits === previousDigits && raw.length < value.length) {
      if (inputType === "deleteContentBackward" && before > 0) {
        digits = digits.slice(0, before - 1) + digits.slice(before);
        before -= 1;
      } else if (inputType === "deleteContentForward") {
        digits = digits.slice(0, before) + digits.slice(before + 1);
      }
    }

    // Los ceros a la izquierda desaparecen al dar formato: el cursor se corre lo mismo.
    const leadingZeros = digits.length - digits.replace(/^0+(?=\d)/, "").length;
    caretDigits.current = Math.max(0, before - leadingZeros);
    onChange(digits);

    // Si lo escrito no cambia el valor (una letra, por ejemplo), no hay nuevo render que
    // reubique el cursor: se hace aquí, cuando el navegador termine de pintar.
    if (formatMoneyInput(digits) === value) {
      const input = event.target;
      const position = positionAfterDigits(value, caretDigits.current);
      caretDigits.current = null;
      requestAnimationFrame(() => input.setSelectionRange(position, position));
    }
  };

  return (
    <span className="inline-grid max-w-full min-w-0 items-center">
      <span
        aria-hidden="true"
        className={cn("invisible col-start-1 row-start-1 px-[0.06em] whitespace-pre", className)}
      >
        {value || "0"}
      </span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        size={1}
        autoFocus={autoFocus}
        ref={inputRef}
        value={value}
        onChange={handleChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "col-start-1 row-start-1 w-full min-w-0 bg-transparent px-[0.06em] outline-none",
          className,
        )}
      />
    </span>
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
  /** Abre el teclado numérico apenas carga la pantalla. */
  autoFocus?: boolean;
};

/** El valor principal de una pantalla: grande, arriba y con el teclado numérico. */
export function HeroMoney({
  name,
  label,
  defaultValue,
  tone,
  error,
  onValueChange,
  autoFocus,
}: HeroMoneyProps) {
  const id = useId();
  const money = useMoneyText(defaultValue, onValueChange);
  // Las cifras largas bajan de tamaño para caber en pantallas angostas.
  const size =
    money.text.length > 11 ? "text-[34px]" : money.text.length > 9 ? "text-[44px]" : "text-[58px]";

  return (
    <div className="flex flex-col items-center gap-1">
      <label
        htmlFor={id}
        className="flex min-h-[72px] max-w-full cursor-text items-center justify-center gap-2 font-display leading-none font-bold tracking-[-0.03em]"
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={cn("text-[38px]", tone === "libre" ? "text-libre" : "text-gasto")}
        >
          $
        </span>
        <AutoSizeInput
          id={id}
          name={name}
          value={money.text}
          onChange={money.onChange}
          error={error}
          autoFocus={autoFocus}
          className={cn(
            "py-1 leading-none placeholder:text-muted-foreground",
            size,
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

export type Option = {
  value: string;
  label: string;
  /** Texto corto para la cuadrícula (por ejemplo «15» en vez de «Día 15»). */
  short?: string;
};

const triggerClass = cn(
  "flex h-11 min-w-0 items-center gap-1.5 rounded-lg pl-2 text-right font-semibold",
  focusRing,
);

const gridOptionClass = (selected: boolean, disabled = false) =>
  cn(
    "flex aspect-square items-center justify-center rounded-full text-[15px] font-semibold tabular-nums",
    focusRing,
    selected ? "bg-primary text-primary-foreground" : "bg-secondary",
    disabled && "opacity-30",
  );

type SelectRowProps = {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  onValueChange?: (value: string) => void;
  /** Lista (por defecto) o cuadrícula, que sirve para los días del mes. */
  layout?: "list" | "grid";
};

/** Fila con una lista desplegable propia: abre una hoja desde abajo con las opciones. */
export function SelectRow({
  name,
  label,
  options,
  defaultValue,
  placeholder = "Elegir",
  error,
  onValueChange,
  layout = "list",
}: SelectRowProps) {
  const id = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const choose = (next: string) => {
    setValue(next);
    onValueChange?.(next);
    setOpen(false);
  };

  return (
    <Row label={label} htmlFor={id} errorId={`${id}-error`} error={error}>
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        data-select={name}
        aria-haspopup="dialog"
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => setOpen(true)}
        className={triggerClass}
      >
        <span className={cn("truncate", !selected && "font-normal text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <div
          role="listbox"
          aria-label={label}
          className={layout === "grid" ? "grid grid-cols-7 gap-1.5 p-2" : "flex flex-col"}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return layout === "grid" ? (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={option.label}
                data-option-value={option.value}
                onClick={() => choose(option.value)}
                className={gridOptionClass(isSelected)}
              >
                {option.short ?? option.label}
              </button>
            ) : (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-value={option.value}
                onClick={() => choose(option.value)}
                className={cn(
                  "flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 text-left",
                  focusRing,
                  isSelected && "font-semibold text-libre",
                )}
              >
                {option.label}
                {isSelected && <Check aria-hidden="true" className="size-5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </Sheet>
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

/**
 * Fila para elegir entre dos opciones a la vista. La elegida va en blanco.
 * El valor viaja en un campo oculto: así lo que se envía es siempre lo que se ve, también
 * después de un envío con error (el navegador reinicia los botones de opción, no este campo).
 */
export function SegmentedRow({ name, label, options, value, onChange }: SegmentedRowProps) {
  const id = useId();
  return (
    <div className="flex min-h-16 items-center justify-between gap-3">
      <span id={id} className="shrink-0 text-muted-foreground">
        {label}
      </span>
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-labelledby={id}
        data-segment={name}
        className="flex rounded-full bg-background p-[3px]"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-[38px] items-center rounded-full px-3.5 font-semibold",
              focusRing,
              option.value === value ? "bg-foreground text-background" : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Las opciones «1» a «31» para elegir un día del mes. */
export function dayOptions(prefix = ""): Option[] {
  return Array.from({ length: 31 }, (_, index) => {
    const day = String(index + 1);
    return { value: day, label: `${prefix}${day}`, short: day };
  });
}

const monthName = (month: number, format: "long" | "short", locale: string) => {
  const text = new Intl.DateTimeFormat(locale, { month: format, timeZone: "UTC" })
    .format(new Date(Date.UTC(2024, month - 1, 1)))
    .replace(".", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

type DateRowProps = {
  name: string;
  label: string;
  /** Fecha guardada, como «2027-12-15». */
  defaultValue?: string;
  /** Primera fecha que se puede elegir. */
  min: CalendarDate;
  /** Última fecha que se puede elegir. */
  max: CalendarDate;
  error?: string;
  onValueChange?: (value: string) => void;
};

/** Fila para elegir una fecha en tres toques: año, mes y día. */
export function DateRow({
  name,
  label,
  defaultValue,
  min,
  max,
  error,
  onValueChange,
}: DateRowProps) {
  const id = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  const selected = parseIsoDate(value);
  const locale = appConfig.defaults.locale;
  const step = year === null ? "year" : month === null ? "month" : "day";
  const titles = { year: "¿Qué año?", month: "¿Qué mes?", day: "¿Qué día?" };

  const openSheet = () => {
    setYear(null);
    setMonth(null);
    setOpen(true);
  };
  const chooseDay = (day: number) => {
    const next = formatIsoDate({ year: year!, month: month!, day });
    setValue(next);
    onValueChange?.(next);
    setOpen(false);
  };
  const isOutside = (date: CalendarDate) =>
    compareDates(date, min) < 0 || compareDates(date, max) > 0;

  return (
    <Row label={label} htmlFor={id} errorId={`${id}-error`} error={error}>
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        data-date={name}
        aria-haspopup="dialog"
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={openSheet}
        className={triggerClass}
      >
        <span className={cn("truncate", !selected && "font-normal text-muted-foreground")}>
          {selected ? formatLongDate(selected) : "Elegir"}
        </span>
        <ChevronDown aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={titles[step]}>
        {step !== "year" && (
          <button
            type="button"
            onClick={() => (step === "day" ? setMonth(null) : setYear(null))}
            className={cn(
              "mx-2 mb-1 flex h-10 items-center gap-1 rounded-full pr-3 text-muted-foreground",
              focusRing,
            )}
          >
            <ChevronLeft aria-hidden="true" className="size-[18px]" />
            {step === "day" ? `${monthName(month!, "long", locale)} de ${year}` : year}
          </button>
        )}

        {step === "year" && (
          <div className="grid grid-cols-3 gap-2 p-2">
            {Array.from({ length: max.year - min.year + 1 }, (_, index) => min.year + index).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  data-option-value={option}
                  onClick={() => setYear(option)}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-2xl font-semibold tabular-nums",
                    focusRing,
                    selected?.year === option
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary",
                  )}
                >
                  {option}
                </button>
              ),
            )}
          </div>
        )}

        {step === "month" && (
          <div className="grid grid-cols-3 gap-2 p-2">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => {
              // Un mes que queda completo por fuera del rango no se puede elegir.
              const disabled =
                isOutside({
                  year: year!,
                  month: option,
                  day: daysInMonth({ year: year!, month: option }),
                }) && isOutside({ year: year!, month: option, day: 1 });
              const isSelected = selected?.year === year && selected?.month === option;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  data-option-value={option}
                  onClick={() => setMonth(option)}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-2xl font-semibold",
                    focusRing,
                    isSelected ? "bg-primary text-primary-foreground" : "bg-secondary",
                    disabled && "opacity-30",
                  )}
                >
                  {monthName(option, "short", locale)}
                </button>
              );
            })}
          </div>
        )}

        {step === "day" && (
          <div className="grid grid-cols-7 gap-1.5 p-2">
            {Array.from(
              { length: daysInMonth({ year: year!, month: month! }) },
              (_, index) => index + 1,
            ).map((option) => {
              const date = { year: year!, month: month!, day: option };
              const disabled = isOutside(date);
              const isSelected = selected !== null && compareDates(selected, date) === 0;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  data-option-value={option}
                  onClick={() => chooseDay(option)}
                  className={gridOptionClass(isSelected, disabled)}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </Row>
  );
}
