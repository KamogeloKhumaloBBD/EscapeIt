import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const metadataBase = new URL(
  process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
);

export const metadata: Metadata = {
  description: "A universal context layer for coding agents.",
  metadataBase,
  openGraph: {
    description: "A universal context layer for coding agents.",
    images: [
      {
        alt: "Context Layer connecting coding agents to work context",
        height: 630,
        url: "/opengraph-image",
        width: 1200,
      },
    ],
    locale: "en_US",
    siteName: "Context Layer",
    title: "Context Layer | Bring Context to Where The Work Happens",
    type: "website",
    url: "/",
  },
  title: "Context Layer | Bring Context to Where The Work Happens",
  twitter: {
    card: "summary_large_image",
    description: "A universal context layer for coding agents.",
    images: [
      {
        alt: "Context Layer connecting coding agents to work context",
        height: 630,
        url: "/opengraph-image",
        width: 1200,
      },
    ],
    title: "Context Layer | Bring Context to Where The Work Happens",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", instrumentSans.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          closeButton
          position="top-right"
          richColors
          theme="light"
          visibleToasts={1}
        />
      </body>
    </html>
  );
}
