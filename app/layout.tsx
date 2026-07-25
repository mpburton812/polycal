import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/providers/AppProviders";
import { fontClassNames } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

import "./globals.css";

export const metadata: Metadata = {
  title: "PolyCal",
  description: "Polyamory group scheduling PWA",
  applicationName: "PolyCal",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "PolyCal",
    // Content sits below the iOS status bar rather than under it, so the app bar stays legible.
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
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
