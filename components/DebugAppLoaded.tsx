"use client";

import { useEffect } from "react";
import { logSystem } from "@/lib/logger";

export function DebugAppLoaded() {
  useEffect(() => {
    logSystem("app_loaded");
  }, []);
  return null;
}
