import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { AppAuthShell } from "@/components/auth/AppAuthShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { StoreProvider } from "@/lib/store";
import { Toasts } from "@/components/ui/Toasts";
import { DebugAppLoaded } from "@/components/DebugAppLoaded";

export const metadata: Metadata = {
  title: "TradeFlow - Order Booking",
  description: "TradeFlow order booking dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <StoreProvider>
            <DebugAppLoaded />
            <AppAuthShell>{children}</AppAuthShell>
            <Toasts />
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
