import { Bricolage_Grotesque, Inter, Space_Grotesk } from "next/font/google";

/** Functional body copy — schedule lines, forms, dense data. */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Labels, section headers, timestamps. */
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

/** Page titles and empty-state headlines. */
export const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

export const fontClassNames = `${inter.variable} ${spaceGrotesk.variable} ${bricolageGrotesque.variable}`;

export const fontFamilies = {
  body: "var(--font-inter), system-ui, sans-serif",
  label: "var(--font-space-grotesk), system-ui, sans-serif",
  display: "var(--font-bricolage), system-ui, sans-serif",
} as const;
