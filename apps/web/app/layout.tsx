import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  description: "A universal context layer for coding agents.",
  title: "Context Layer | Bring Context to Where The Work Happens",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", instrumentSans.variable)}>
      <body>
        {children}
        <Toaster closeButton position="top-right" richColors theme="light" />
      </body>
    </html>
  );
}
