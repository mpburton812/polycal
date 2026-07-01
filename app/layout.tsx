import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/providers/AppProviders";
import { fontClassNames } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

import "./globals.css";

export const metadata: Metadata = {
  title: "PolyCal",
  description: "Polyamory group scheduling PWA",
  appleWebApp: {
    capable: true,
    title: "PolyCal",
  },
};

export const viewport: Viewport = {
  themeColor: GARDEN_TOKENS.sage,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={fontClassNames}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
