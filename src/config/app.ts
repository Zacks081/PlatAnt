/**
 * Datos generales de la app. Es el único lugar donde se escribe el nombre:
 * todo lo demás (títulos, ícono instalable, encabezados) lo lee de aquí.
 */
export const appConfig = {
  name: {
    /** Parte que va en blanco. */
    first: "Plat",
    /** Parte que va en verde. */
    second: "Ant",
    full: "PlatAnt",
  },
  description:
    "Finanzas personales para quien cobra por quincena: cuánto tienes, cuánto está libre y a dónde se van los gastos hormiga.",
  /** Idioma de la interfaz. */
  language: "es-CO",
  /**
   * Valores de partida para un usuario nuevo. Cada usuario los puede cambiar
   * en su perfil, así que el resto del código nunca debe darlos por fijos.
   */
  defaults: {
    currency: "COP",
    locale: "es-CO",
    timeZone: "America/Bogota",
  },
  /** Color de fondo de la app. El navegador lo usa para pintar su barra superior. */
  backgroundColor: "#0a0c0b",
  /**
   * Fondo del logo tal como lo entregó Santiago. Es el fondo de los íconos, y lo usa
   * la pantalla de carga de la app instalada para que el ícono no se vea como un cuadro pegado.
   */
  logoBackgroundColor: "#0c1f19",
} as const;
