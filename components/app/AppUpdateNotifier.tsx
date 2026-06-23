"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { AppUpdateManifest } from "@/lib/appUpdateManifest";

const DISMISSED_VERSION_STORAGE_KEY = "tf-app-update-dismissed-version";
const CHECK_INTERVAL_MS = 120000;

type Props = {
  initialManifest: AppUpdateManifest;
};

export function AppUpdateNotifier({ initialManifest }: Props) {
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdateManifest | null>(null);
  const [checking, setChecking] = useState(false);
  const dismissedVersionRef = useRef<string>("");
  const initialVersion = initialManifest.version;

  useEffect(() => {
    if (typeof window === "undefined") return;
    dismissedVersionRef.current = window.localStorage.getItem(DISMISSED_VERSION_STORAGE_KEY) || "";
  }, []);

  const shouldSkipChecks = useMemo(() => initialVersion === "dev", [initialVersion]);

  const checkForUpdate = useCallback(async () => {
    if (shouldSkipChecks) return;
    if (checking) return;
    setChecking(true);
    try {
      const response = await fetch("/api/app-update", { cache: "no-store" });
      if (!response.ok) return;
      const nextManifest = (await response.json()) as AppUpdateManifest;
      if (!nextManifest?.version) return;
      if (nextManifest.version === initialVersion) return;
      if (dismissedVersionRef.current === nextManifest.version) return;
      setPendingUpdate(nextManifest);
    } catch {
      return;
    } finally {
      setChecking(false);
    }
  }, [checking, initialVersion, shouldSkipChecks]);

  useEffect(() => {
    if (shouldSkipChecks) return;
    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, CHECK_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    };

    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForUpdate, shouldSkipChecks]);

  if (!pendingUpdate) return null;

  return (
    <div className="fixed inset-0 z-[11000] bg-black/45 p-4">
      <div className="mx-auto mt-[8vh] w-full max-w-[640px] overflow-hidden rounded-2xl border border-border bg-bg-card shadow-[0_28px_90px_rgba(15,23,42,0.24)]">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                <Sparkles size={14} />
                New Update Available
              </div>
              <h3 className="mt-2 text-[24px] font-bold leading-tight text-fg">{pendingUpdate.title}</h3>
              <p className="mt-2 max-w-[54ch] text-[13px] leading-6 text-fg-muted">{pendingUpdate.summary}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg-subtle px-3 py-2 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Version</div>
              <div className="mt-1 text-[13px] font-semibold text-fg">{pendingUpdate.versionLabel}</div>
              <div className="mt-1 text-[11px] text-fg-subtle">{pendingUpdate.publishedAt}</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {pendingUpdate.sections.map((section) => (
            <section key={section.title} className="rounded-xl border border-border bg-bg-subtle/60 px-4 py-3">
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{section.title}</div>
              <div className="mt-2 space-y-2">
                {section.items.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-[13px] leading-6 text-fg">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              dismissedVersionRef.current = pendingUpdate.version;
              window.localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, pendingUpdate.version);
              setPendingUpdate(null);
            }}
          >
            Later
          </Button>
          <Button
            size="sm"
            variant="primary"
            className={cn("min-w-[126px]")}
            onClick={() => {
              window.localStorage.removeItem(DISMISSED_VERSION_STORAGE_KEY);
              window.location.reload();
            }}
          >
            <RefreshCw size={14} />
            Update Now
          </Button>
        </div>
      </div>
    </div>
  );
}
