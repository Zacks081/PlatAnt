import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";

import { appConfig } from "@/config/app";
import { cn } from "@/lib/utils";

import "./globals.css";

// Letra con carácter, para cifras y títulos.
const displayFont = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

// Letra neutra y legible, para todo lo demás.
const bodyFont = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: appConfig.name.full,
    template: `%s · ${appConfig.name.full}`,
  },
  description: appConfig.description,
  applicationName: appConfig.name.full,
  appleWebApp: {
    capable: true,
    title: appConfig.name.full,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: appConfig.backgroundColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={appConfig.language}
      // "dark" va siempre: la app solo tiene tema oscuro por ahora.
      className={cn("dark h-full antialiased", displayFont.variable, bodyFont.variable)}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
