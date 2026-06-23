import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/providers/AppProviders";

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
  themeColor: "#5c6bc0",
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
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
