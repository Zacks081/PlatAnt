import type { MetadataRoute } from "next";

import { appConfig } from "@/config/app";

/**
 * Le dice al celular cómo instalar la app: nombre, ícono y colores.
 * Con esto aparece la opción "Agregar a pantalla de inicio".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.name.full,
    short_name: appConfig.name.full,
    description: appConfig.description,
    lang: appConfig.language,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: appConfig.logoBackgroundColor,
    theme_color: appConfig.backgroundColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
