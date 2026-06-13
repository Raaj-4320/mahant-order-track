"use client";

import { useEffect, useMemo, useState } from "react";
import { isAnyFirebaseModeEnabled, isAuthRequiredModeEnabled } from "@/lib/runtimeConfig";
import { getFirebaseConfigStatus } from "@/lib/firebase/client";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  ensureBusinessMemberProfile,
  getAdminRegistrationState,
  getBusinessMember,
  touchBusinessMemberLastLogin,
  type AdminRegistrationState,
  type BusinessMemberRecord,
} from "@/services/firebase/adminAuthFirebaseService";

const firebaseStatus = getFirebaseConfigStatus();

export function useBusinessAccess() {
  const auth = useAuthUser();
  const [member, setMember] = useState<BusinessMemberRecord | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [registrationState, setRegistrationState] = useState<AdminRegistrationState>({
    hasAdmin: false,
    businessId: firebaseStatus.businessId || "mahant",
  });
  const [registrationLoading, setRegistrationLoading] = useState(
    firebaseStatus.hasFirebaseConfig && (isAuthRequiredModeEnabled() || isAnyFirebaseModeEnabled()),
  );

  const authRequired = firebaseStatus.hasFirebaseConfig && (isAuthRequiredModeEnabled() || isAnyFirebaseModeEnabled());

  useEffect(() => {
    let cancelled = false;
    if (!authRequired) {
      setRegistrationLoading(false);
      return;
    }
    setRegistrationLoading(true);
    getAdminRegistrationState()
      .then((state) => {
        if (!cancelled) setRegistrationState(state);
      })
      .finally(() => {
        if (!cancelled) setRegistrationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authRequired]);

  useEffect(() => {
    let cancelled = false;
    if (!authRequired || !auth.user?.uid) {
      setMember(null);
      setMemberLoading(false);
      return;
    }

    setMemberLoading(true);
    getBusinessMember(auth.user.uid)
      .then(async (record) => {
        const resolvedRecord =
          record ??
          (await ensureBusinessMemberProfile({
            uid: auth.user!.uid,
            email: auth.user!.email,
            name: auth.user!.displayName,
          }));

        try {
          await touchBusinessMemberLastLogin(auth.user!.uid);
        } catch {
          // Non-blocking metadata update.
        }

        if (!cancelled) setMember(resolvedRecord);
      })
      .catch(() => {
        if (!cancelled) setMember(null);
      })
      .finally(() => {
        if (!cancelled) setMemberLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authRequired, auth.user?.uid]);

  const memberRole = member?.role ?? (auth.user ? "admin" : null);
  const canManageMaintenance = Boolean(auth.user);
  const canAccessSettings = Boolean(auth.user);

  return useMemo(
    () => ({
      ...auth,
      authRequired,
      authLoading: auth.loading,
      member,
      memberLoading,
      memberRole,
      hasAdmin: registrationState.hasAdmin,
      registrationLoading,
      canManageMaintenance,
      canAccessSettings,
      businessId: registrationState.businessId,
      refreshRegistrationState: async () => {
        if (!authRequired) return registrationState;
        const next = await getAdminRegistrationState();
        setRegistrationState(next);
        return next;
      },
    }),
    [
      auth,
      authRequired,
      member,
      memberLoading,
      memberRole,
      registrationState,
      registrationLoading,
      canManageMaintenance,
      canAccessSettings,
    ],
  );
}
