"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";
import { getAppAccessSettings, saveAppAccessPassword } from "@/services/firebase/appAccessFirebaseService";
import { hashAppAccessPassword } from "@/lib/appAccess";

export default function SettingsPage() {
  const router = useRouter();
  const { user, changePasswordWithReauth } = useBusinessAccess();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [appAccessPassword, setAppAccessPassword] = useState("");
  const [appAccessConfirm, setAppAccessConfirm] = useState("");
  const [appAccessBusy, setAppAccessBusy] = useState(false);
  const [appAccessError, setAppAccessError] = useState<string | null>(null);
  const [appAccessSuccess, setAppAccessSuccess] = useState<string | null>(null);
  const [appAccessEnabled, setAppAccessEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAppAccessSettings()
      .then((settings) => {
        if (!cancelled) setAppAccessEnabled(Boolean(settings?.passwordHash));
      })
      .catch(() => {
        if (!cancelled) setAppAccessEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    if (!user?.email) {
      setBusy(false);
      setError("Password management is available only when a Firebase auth session is active.");
      return;
    }
    if (!form.currentPassword) {
      setBusy(false);
      setError("Current password is required.");
      return;
    }
    if (form.newPassword.length < 8) {
      setBusy(false);
      setError("New password must be at least 8 characters.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setBusy(false);
      setError("Confirm new password must match.");
      return;
    }

    try {
      await changePasswordWithReauth(form.currentPassword, form.newPassword);
      setSuccess("Password changed successfully.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password change failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitAppAccessPassword = async () => {
    setAppAccessBusy(true);
    setAppAccessError(null);
    setAppAccessSuccess(null);

    if (appAccessPassword.trim().length < 8) {
      setAppAccessBusy(false);
      setAppAccessError("Access password must be at least 8 characters.");
      return;
    }
    if (appAccessPassword !== appAccessConfirm) {
      setAppAccessBusy(false);
      setAppAccessError("Confirm access password must match.");
      return;
    }

    try {
      const passwordHash = await hashAppAccessPassword(appAccessPassword);
      await saveAppAccessPassword(passwordHash);
      setAppAccessEnabled(true);
      setAppAccessPassword("");
      setAppAccessConfirm("");
      setAppAccessSuccess("Workspace access password saved. The site will ask for it on the next reopen.");
    } catch (e) {
      setAppAccessError(e instanceof Error ? e.message : "Could not save access password.");
    } finally {
      setAppAccessBusy(false);
    }
  };

  return (
    <PageShell title="Settings">
      <div className="space-y-4 p-6">
        {!user ? (
        <div className="card max-w-xl space-y-3 p-5">
            <div className="text-[18px] font-semibold">Password Management</div>
            <div className="text-sm text-fg-subtle">
              This workspace opens directly now. If you later load it with an active Firebase Auth session, you can change that account&apos;s password here.
            </div>
            <Button variant="secondary" onClick={() => router.push("/orders")}>
              Back to Orders
            </Button>
          </div>
        ) : null}
        <div className="card max-w-xl space-y-4 p-5">
          <div>
            <h2 className="text-[18px] font-semibold">Workspace Access Password</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              {appAccessEnabled
                ? "Update the password that users must enter whenever they reopen the site."
                : "Set a password here so users must enter it whenever they reopen the site."}
            </p>
          </div>
          <Input
            type="password"
            value={appAccessPassword}
            onChange={(e) => setAppAccessPassword(e.target.value)}
            placeholder="New workspace access password"
          />
          <Input
            type="password"
            value={appAccessConfirm}
            onChange={(e) => setAppAccessConfirm(e.target.value)}
            placeholder="Confirm workspace access password"
          />
          {appAccessError ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{appAccessError}</div> : null}
          {appAccessSuccess ? <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{appAccessSuccess}</div> : null}
          <Button variant="primary" disabled={appAccessBusy} onClick={() => void submitAppAccessPassword()}>
            {appAccessBusy ? "Saving..." : appAccessEnabled ? "Update Access Password" : "Set Access Password"}
          </Button>
        </div>

        <div className="card max-w-xl space-y-4 p-5">
          <div>
            <h2 className="text-[18px] font-semibold">Change Password</h2>
            <p className="mt-1 text-sm text-fg-subtle">Re-enter your current password before setting a new one.</p>
          </div>
          <Input
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm((s) => ({ ...s, currentPassword: e.target.value }))}
            placeholder="Current password"
          />
          <Input
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm((s) => ({ ...s, newPassword: e.target.value }))}
            placeholder="New password"
          />
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm((s) => ({ ...s, confirmPassword: e.target.value }))}
            placeholder="Confirm new password"
          />
          {error ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {success ? <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
          <Button variant="primary" disabled={busy || !user} onClick={() => void submit()}>
            {busy ? "Updating Password..." : "Change Password"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
