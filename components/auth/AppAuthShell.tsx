"use client";

import { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";

export function AppAuthShell({ children }: { children: ReactNode }) {
  useBusinessAccess();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-bg">{children}</div>
    </div>
  );
}
