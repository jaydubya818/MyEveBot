import { OwnerSessionBoundary } from "@/components/owner-session-boundary";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppearanceSync } from "@/components/appearance-sync";
import { DestinationGate } from "@/components/owner/destination-gate";
import { productDestinations } from "@/components/owner/destinations";
import { allowedDestinationHrefs } from "@/lib/external-alpha/features";
import { AGENT_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: AGENT_NAME,
  description: `Chat with your personal ${AGENT_NAME} agent`,
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // null outside an external-alpha installation; otherwise only allowlisted pages are linked.
  const hrefs = allowedDestinationHrefs(productDestinations);
  return (
    <html
      lang="en"
      data-mode="dark"
      suppressHydrationWarning
      className={cn("font-sans", inter.variable, geist.variable, geistMono.variable)}
    >
      <body className="antialiased">
        <OwnerSessionBoundary><AppearanceSync />
        <DestinationGate hrefs={hrefs}>{children}</DestinationGate></OwnerSessionBoundary>
      </body>
    </html>
  );
}
