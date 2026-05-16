import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { StoreProvider } from "@/lib/store";
import { Toasts } from "@/components/ui/Toasts";
import { DebugAppLoaded } from "@/components/DebugAppLoaded";

export const metadata: Metadata = {
  title: "TradeFlow — Order Booking",
  description: "TradeFlow order booking dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <StoreProvider>
            <DebugAppLoaded />
            <div className="flex h-screen w-screen overflow-hidden">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col bg-bg">{children}</div>
            </div>
            <Toasts />
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
