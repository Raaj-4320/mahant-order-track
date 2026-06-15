"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getAppAccessSessionKey, hashAppAccessPassword } from "@/lib/appAccess";
import { getAppAccessSettings } from "@/services/firebase/appAccessFirebaseService";

export function AppAuthShell({ children }: { children: ReactNode }) {
  const { businessId } = useBusinessAccess();
  const [appAccessLoading, setAppAccessLoading] = useState(true);
  const [passwordHash, setPasswordHash] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<"full" | "limited" | "locked">("full");
  const [passwordInput, setPasswordInput] = useState("");
  const [checkingPassword, setCheckingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAppAccessLoading(true);
      try {
        const settings = await getAppAccessSettings();
        if (cancelled) return;

        if (!settings?.passwordHash) {
          setPasswordHash(null);
          setAccessMode("full");
          setAppAccessLoading(false);
          return;
        }

        setPasswordHash(settings.passwordHash);
        const sessionValue = typeof window !== "undefined" ? window.sessionStorage.getItem(getAppAccessSessionKey(businessId || "mahant")) : null;
        if (sessionValue === "full" || sessionValue === "limited") {
          setAccessMode(sessionValue);
        } else {
          setAccessMode("locked");
        }
      } catch {
        if (!cancelled) {
          setPasswordHash(null);
          setAccessMode("full");
        }
      } finally {
        if (!cancelled) setAppAccessLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const limitedView = useMemo(
    () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-bg p-6">
        <div className="card max-w-xl space-y-3 p-6 text-center">
          <div className="text-[22px] font-semibold">Protected Workspace</div>
          <div className="text-sm text-fg-subtle">
            This session does not have the correct access password, so the system opened in restricted mode and no data is visible.
          </div>
          <div className="flex justify-center">
            <Button
              variant="secondary"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.sessionStorage.removeItem(getAppAccessSessionKey(businessId || "mahant"));
                }
                setPasswordInput("");
                setAccessMode("locked");
              }}
            >
              Enter Password Again
            </Button>
          </div>
        </div>
      </div>
    ),
    [businessId],
  );

  const unlock = async () => {
    if (!passwordHash) {
      setAccessMode("full");
      return;
    }
    setCheckingPassword(true);
    try {
      const nextHash = await hashAppAccessPassword(passwordInput);
      const nextMode = nextHash === passwordHash ? "full" : "limited";
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(getAppAccessSessionKey(businessId || "mahant"), nextMode);
      }
      setAccessMode(nextMode);
      setPasswordInput("");
    } finally {
      setCheckingPassword(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col bg-bg">
        {appAccessLoading ? null : accessMode === "limited" ? limitedView : children}
        {!appAccessLoading && accessMode === "locked" ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
            <div className="card w-full max-w-md space-y-4 p-6">
              <div>
                <div className="text-[22px] font-semibold">Enter Access Password</div>
                <div className="mt-1 text-sm text-fg-subtle">This site is protected. Enter the saved workspace password to unlock data.</div>
              </div>
              <Input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Access password"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !checkingPassword) {
                    event.preventDefault();
                    void unlock();
                  }
                }}
              />
              <Button variant="primary" disabled={checkingPassword || !passwordInput.trim()} onClick={() => void unlock()}>
                {checkingPassword ? "Checking..." : "Unlock"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
