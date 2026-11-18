import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Beer,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  CircleEllipsis,
  Coffee,
  Coins,
  Dog,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PiggyBank,
  Plane,
  Popcorn,
  Receipt,
  Scale,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Utensils,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** Íconos que se pueden elegir para una categoría. La clave es la que se guarda. */
export const CATEGORY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  comida: { icon: Utensils, label: "Comida" },
  mercado: { icon: ShoppingCart, label: "Mercado" },
  cafe: { icon: Coffee, label: "Café" },
  salidas: { icon: Beer, label: "Salidas" },
  transporte: { icon: Bus, label: "Transporte" },
  carro: { icon: Car, label: "Carro" },
  gasolina: { icon: Fuel, label: "Gasolina" },
  vivienda: { icon: House, label: "Vivienda" },
  servicios: { icon: Zap, label: "Servicios" },
  celular: { icon: Smartphone, label: "Celular" },
  salud: { icon: HeartPulse, label: "Salud" },
  deporte: { icon: Dumbbell, label: "Deporte" },
  educacion: { icon: GraduationCap, label: "Educación" },
  libros: { icon: BookOpen, label: "Libros" },
  entretenimiento: { icon: Popcorn, label: "Entretenimiento" },
  ropa: { icon: Shirt, label: "Ropa" },
  regalos: { icon: Gift, label: "Regalos" },
  viajes: { icon: Plane, label: "Viajes" },
  mascotas: { icon: Dog, label: "Mascotas" },
  hijos: { icon: Baby, label: "Hijos" },
  arreglos: { icon: Wrench, label: "Arreglos" },
  cuidado: { icon: Sparkles, label: "Cuidado personal" },
  deudas: { icon: Landmark, label: "Deudas" },
  ahorro: { icon: PiggyBank, label: "Ahorro" },
  comisiones: { icon: Receipt, label: "Comisiones" },
  salario: { icon: Briefcase, label: "Salario" },
  ingresos: { icon: Coins, label: "Ingresos" },
  otros: { icon: CircleEllipsis, label: "Otros" },
};

export const ICON_KEYS = Object.keys(CATEGORY_ICONS);

/**
 * Íconos de los traslados y del cuadre: se muestran en el historial, pero no se eligen para
 * una categoría.
 */
const TRANSFER_ICONS: Record<string, LucideIcon> = {
  retiro: Banknote,
  consignacion: ArrowLeftRight,
  cuadre: Scale,
};

/** Ícono de una categoría dentro de un círculo. Si la clave no existe, usa «otros». */
export function CategoryIcon({
  icon,
  tone = "neutral",
  className,
}: {
  icon: string | null | undefined;
  tone?: "neutral" | "gasto" | "libre";
  className?: string;
}) {
  const Icon =
    TRANSFER_ICONS[icon ?? ""] ?? (CATEGORY_ICONS[icon ?? ""] ?? CATEGORY_ICONS.otros).icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary",
        tone === "gasto" && "text-gasto",
        tone === "libre" && "text-libre",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
