"use client";

import { cloneElement, isValidElement, ReactNode, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "app:sidebar-collapsed";
const PASSWORD_GATE_DISABLED = true;

export function AppAuthShell({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    setSidebarCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} />
      <div className="relative flex min-w-0 flex-1 flex-col bg-bg">
        <button
          type="button"
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={() => setSidebarCollapsed((current) => !current)}
          className="absolute left-4 top-4 z-20 hidden h-9 w-9 place-items-center rounded-full border border-border bg-bg-card shadow-sm transition-colors hover:border-fg-subtle lg:grid"
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        {PASSWORD_GATE_DISABLED && isValidElement(children)
          ? cloneElement(children, {
              sidebarCollapsed,
              onToggleSidebar: () => setSidebarCollapsed((current) => !current),
            } as Record<string, unknown>)
          : children}
      </div>
    </div>
  );
}
