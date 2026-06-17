"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useBusinessAccess } from "@/hooks/useBusinessAccess";
import { createAppAccessSalt, getAppAccessSessionKey, hashAppAccessPassword } from "@/lib/appAccess";
import { saveAppAccessPassword } from "@/services/firebase/appAccessFirebaseService";

export default function SettingsPage() {
  const router = useRouter();
  const { user, businessId } = useBusinessAccess();
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
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
      const passwordSalt = createAppAccessSalt();
      const passwordHash = await hashAppAccessPassword(form.newPassword, passwordSalt);
      await saveAppAccessPassword({ passwordHash, passwordSalt });
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(getAppAccessSessionKey(businessId || "mahant"), "full");
      }
      setSuccess("Workspace password updated successfully.");
      setForm({ newPassword: "", confirmPassword: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password update failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Settings">
      <div className="space-y-4 p-6">
        {!user ? (
        <div className="card max-w-xl space-y-3 p-5">
            <div className="text-[18px] font-semibold">Workspace Password</div>
            <div className="text-sm text-fg-subtle">
              This page manages the app-level workspace password. Firebase authentication and Firestore security remain unchanged.
            </div>
            <Button variant="secondary" onClick={() => router.push("/orders")}>
              Back to Orders
            </Button>
          </div>
        ) : null}
        <div className="card max-w-xl space-y-4 p-5">
          <div>
            <h2 className="text-[18px] font-semibold">Set/Reset Password</h2>
            <p className="mt-1 text-sm text-fg-subtle">Set a new workspace password. Old passwords are ignored and are no longer required.</p>
          </div>
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
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving Password..." : "Save Password"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
