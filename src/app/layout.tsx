import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

// Modern workhorse sans for all UI/body text.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Classic old-style serif (with modern optical sizing) for display headings.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CareerOS — a complete campaign for getting hired",
    template: "%s · CareerOS",
  },
  description:
    "CareerOS turns a job listing into a complete strategy for getting hired: research, fit analysis, hiring-network mapping, gap-to-action planning, and evidence-backed outreach.",
  applicationName: "CareerOS",
};

export const viewport: Viewport = {
  themeColor: "#2549ea",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
