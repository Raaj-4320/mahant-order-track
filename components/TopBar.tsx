"use client";

import { Bell, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function TopBar({
  title,
  sidebarCollapsed = false,
  onToggleSidebar,
}: {
  title: string;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 grid h-[58px] grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-bg/80 px-5 backdrop-blur">
      <div className="flex items-center gap-2">
        {onToggleSidebar ? (
          <button
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            onClick={onToggleSidebar}
            className="hidden h-8 w-8 place-items-center rounded-full border border-border bg-bg-card transition-colors hover:border-fg-subtle lg:grid"
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        ) : null}
      </div>
      <h1 className="text-center text-[18px] font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center justify-end gap-2">
        <button
          aria-label="Notifications"
          className="relative grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors"
        >
          <Bell size={14} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
        </button>
        <button
          aria-label="Toggle theme"
          onClick={toggle}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-bg-card hover:border-fg-subtle transition-colors"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
}
