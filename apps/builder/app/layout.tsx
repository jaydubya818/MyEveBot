import { Theme } from "frosted-ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "MyEve — Personal Agent Builder",
  description: "Configure your own persistent personal AI and deploy it to your Vercel account.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* Whop-style frosted dark theme with the classic blue accent. */}
        <Theme appearance="dark" accentColor="blue" className="min-h-dvh bg-canvas text-gray-12">
          {children}
        </Theme>
      </body>
    </html>
  );
}
