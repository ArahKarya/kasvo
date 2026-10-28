import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { getLocale } from "@/i18n/server";
import { HIDE_AMOUNTS_COOKIE, THEME_COOKIE } from "@/components/amounts-cookie";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kasvo", template: "%s · Kasvo" },
  description: "Open-source personal finance with a first-party MCP server.",
};

/** `cover` lets the Capacitor app draw under the notch; layouts pad with safe-area insets. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191c1a" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const jar = await cookies();
  const hideAmounts = jar.get(HIDE_AMOUNTS_COOKIE)?.value === "1";
  const theme = jar.get(THEME_COOKIE)?.value;
  return (
    <html lang={locale} data-hide-amounts={hideAmounts || undefined} data-theme={theme === "light" || theme === "dark" ? theme : undefined} className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
