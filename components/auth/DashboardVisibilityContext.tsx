"use client";

import { createContext, useContext } from "react";

type DashboardVisibilityContextValue = {
  dashboardVisible: boolean;
  setDashboardVisible: React.Dispatch<React.SetStateAction<boolean>>;
};

const DashboardVisibilityContext = createContext<DashboardVisibilityContextValue | null>(null);

export function DashboardVisibilityProvider({
  value,
  children,
}: {
  value: DashboardVisibilityContextValue;
  children: React.ReactNode;
}) {
  return <DashboardVisibilityContext.Provider value={value}>{children}</DashboardVisibilityContext.Provider>;
}

export function useDashboardVisibility() {
  const context = useContext(DashboardVisibilityContext);
  if (!context) {
    throw new Error("useDashboardVisibility must be used within DashboardVisibilityProvider");
  }
  return context;
}
