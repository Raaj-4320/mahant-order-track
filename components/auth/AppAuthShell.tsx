"use client";

import { cloneElement, isValidElement, ReactNode, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { usePathname, useRouter } from "next/navigation";
import { DashboardVisibilityProvider } from "@/components/auth/DashboardVisibilityContext";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "app:sidebar-collapsed";
const PASSWORD_GATE_DISABLED = true;

export function AppAuthShell({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardVisible, setDashboardVisible] = useState(true);
  const [pendingDashboardHide, setPendingDashboardHide] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    setSidebarCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleDashboardShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.repeat) return;
      if (event.key.toLowerCase() !== "d") return;
      event.preventDefault();
      if (dashboardVisible && pathname.startsWith("/dashboard")) {
        setPendingDashboardHide(true);
        router.push("/orders");
        return;
      }
      setDashboardVisible((current) => !current);
    };
    window.addEventListener("keydown", handleDashboardShortcut);
    return () => {
      window.removeEventListener("keydown", handleDashboardShortcut);
    };
  }, [dashboardVisible, pathname, router]);

  useEffect(() => {
    if (!pendingDashboardHide) return;
    if (pathname.startsWith("/dashboard")) return;
    setDashboardVisible(false);
    setPendingDashboardHide(false);
  }, [pathname, pendingDashboardHide]);

  return (
    <DashboardVisibilityProvider value={{ dashboardVisible, setDashboardVisible }}>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} showDashboard={dashboardVisible} />
        <div className="relative flex min-w-0 flex-1 flex-col bg-bg">
          {PASSWORD_GATE_DISABLED && isValidElement(children)
            ? cloneElement(children, {
                sidebarCollapsed,
                onToggleSidebar: () => setSidebarCollapsed((current) => !current),
              } as Record<string, unknown>)
            : children}
        </div>
      </div>
    </DashboardVisibilityProvider>
  );
}
