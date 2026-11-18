/** Los pasos del recorrido inicial, en orden. Los dos primeros son obligatorios. */
export const STEPS = [
  { number: 1, slug: "ingresos", optional: false },
  { number: 2, slug: "saldos", optional: false },
  { number: 3, slug: "gastos-fijos", optional: true },
  { number: 4, slug: "tarjeta", optional: true },
  { number: 5, slug: "deudas", optional: true },
  { number: 6, slug: "meta", optional: true },
] as const;

export type StepNumber = (typeof STEPS)[number]["number"];
export const LAST_STEP: StepNumber = 6;

export const SUMMARY_PATH = "/configuracion/resumen";
export const SETTINGS_PATH = "/ajustes";

export function stepPath(step: StepNumber): string {
  return `/configuracion/${STEPS[step - 1].slug}`;
}

type Progress = { onboardingCompleted: boolean; onboardingStep: number };

/**
 * Si la persona está corrigiendo algo ya hecho (desde Ajustes o desde el resumen)
 * en vez de avanzar por primera vez.
 */
export function isEditing(progress: Progress): boolean {
  return progress.onboardingCompleted || progress.onboardingStep >= LAST_STEP;
}

/** Texto del botón principal de un paso. */
export function submitLabel(progress: Progress): string {
  return isEditing(progress) ? "Guardar" : "Continuar";
}

/** El paso que le toca a alguien que no ha terminado: el siguiente al último que completó. */
export function currentPath({ onboardingStep }: Progress): string {
  return onboardingStep >= LAST_STEP ? SUMMARY_PATH : stepPath((onboardingStep + 1) as StepNumber);
}

/** Si puede abrir un paso: los que ya hizo y el que sigue, nunca saltarse uno. */
export function canOpenStep(step: StepNumber, progress: Progress): boolean {
  return progress.onboardingCompleted || step <= progress.onboardingStep + 1;
}

/**
 * A dónde ir después de guardar un paso:
 * - quien ya terminó el recorrido está editando desde Ajustes y vuelve allá;
 * - quien ya llegó al resumen vuelve al resumen;
 * - los demás siguen al paso siguiente.
 */
export function pathAfterStep(step: StepNumber, progress: Progress): string {
  if (progress.onboardingCompleted) return SETTINGS_PATH;
  if (progress.onboardingStep >= LAST_STEP || step === LAST_STEP) return SUMMARY_PATH;
  return stepPath((step + 1) as StepNumber);
}

/**
 * A dónde lleva la flecha de volver de un paso: siempre al paso anterior. El recorrido es
 * una línea, no un ciclo: antes del primer paso no hay nada, así que ahí no hay flecha.
 */
export function pathBeforeStep(step: StepNumber, progress: Progress): string | null {
  if (progress.onboardingCompleted) return SETTINGS_PATH;
  return step > 1 ? stepPath((step - 1) as StepNumber) : null;
}
