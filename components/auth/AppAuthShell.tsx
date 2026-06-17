"use client";

import { cloneElement, isValidElement, ReactNode, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createAppAccessSalt, getAppAccessSessionKey, hashAppAccessPassword } from "@/lib/appAccess";
import { getAppAccessSettings, saveAppAccessPassword } from "@/services/firebase/appAccessFirebaseService";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "app:sidebar-collapsed";

export function AppAuthShell({ children }: { children: ReactNode }) {
  const { businessId } = useBusinessAccess();
  const [appAccessLoading, setAppAccessLoading] = useState(true);
  const [passwordHash, setPasswordHash] = useState("");
  const [passwordSalt, setPasswordSalt] = useState("");
  const [accessMode, setAccessMode] = useState<"full" | "locked" | "setup">("setup");
  const [passwordInput, setPasswordInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setAppAccessLoading(true);
      try {
        const settings = await getAppAccessSettings();
        if (cancelled) return;

        if (!settings || settings.requiresSetup) {
          setPasswordHash("");
          setPasswordSalt("");
          setAccessMode("setup");
          setAppAccessLoading(false);
          return;
        }

        setPasswordHash(settings.passwordHash);
        setPasswordSalt(settings.passwordSalt);
        const sessionValue = typeof window !== "undefined" ? window.sessionStorage.getItem(getAppAccessSessionKey(businessId || "mahant")) : null;
        if (sessionValue === "full") {
          setAccessMode("full");
        } else {
          setAccessMode("locked");
        }
      } catch {
        if (!cancelled) {
          setPasswordHash("");
          setPasswordSalt("");
          setAccessMode("setup");
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

  const unlock = async () => {
    setCheckingPassword(true);
    setAccessError(null);
    try {
      const nextHash = await hashAppAccessPassword(passwordInput, passwordSalt);
      if (nextHash !== passwordHash) {
        setAccessError("Incorrect password. Try again.");
        return;
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(getAppAccessSessionKey(businessId || "mahant"), "full");
      }
      setAccessMode("full");
      setPasswordInput("");
    } finally {
      setCheckingPassword(false);
    }
  };

  const setFreshPassword = async () => {
    const trimmedPassword = newPassword.trim();
    if (trimmedPassword.length < 8) {
      setAccessError("New password must be at least 8 characters.");
      return;
    }
    if (trimmedPassword !== confirmPassword.trim()) {
      setAccessError("Confirm password must match.");
      return;
    }
    setCheckingPassword(true);
    setAccessError(null);
    try {
      const salt = createAppAccessSalt();
      const nextHash = await hashAppAccessPassword(trimmedPassword, salt);
      await saveAppAccessPassword({ passwordHash: nextHash, passwordSalt: salt });
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(getAppAccessSessionKey(businessId || "mahant"), "full");
      }
      setPasswordHash(nextHash);
      setPasswordSalt(salt);
      setNewPassword("");
      setConfirmPassword("");
      setAccessMode("full");
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Password setup failed.");
    } finally {
      setCheckingPassword(false);
    }
  };

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
        {appAccessLoading
          ? null
          : isValidElement(children)
              ? cloneElement(children, {
                  sidebarCollapsed,
                  onToggleSidebar: () => setSidebarCollapsed((current) => !current),
                } as Record<string, unknown>)
              : children}
        {!appAccessLoading && accessMode === "setup" ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
            <div className="card w-full max-w-md space-y-4 p-6">
              <div>
                <div className="text-[22px] font-semibold">Set New Password</div>
                <div className="mt-1 text-sm text-fg-subtle">Set a new workspace password to continue. Old passwords are no longer accepted.</div>
              </div>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !checkingPassword) {
                    event.preventDefault();
                    void setFreshPassword();
                  }
                }}
              />
              {accessError ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{accessError}</div> : null}
              <Button variant="primary" disabled={checkingPassword || !newPassword.trim() || !confirmPassword.trim()} onClick={() => void setFreshPassword()}>
                {checkingPassword ? "Saving..." : "Set Password"}
              </Button>
            </div>
          </div>
        ) : null}
        {!appAccessLoading && accessMode === "locked" ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
            <div className="card w-full max-w-md space-y-4 p-6">
              <div>
                <div className="text-[22px] font-semibold">Enter Password</div>
                <div className="mt-1 text-sm text-fg-subtle">Enter the new workspace password to unlock the app.</div>
              </div>
              <Input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Workspace password"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !checkingPassword) {
                    event.preventDefault();
                    void unlock();
                  }
                }}
              />
              {accessError ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{accessError}</div> : null}
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
