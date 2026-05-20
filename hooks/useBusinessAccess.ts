"use client";

import { useAuthUser } from "@/hooks/useAuthUser";
import { getBusinessMember } from "@/services/firebase/businessBootstrapFirebaseService";
import { useEffect, useMemo, useState } from "react";

const MAINTENANCE_ROLES = new Set(["owner", "admin"]);

export function useBusinessAccess() {
  const { user, loading: authLoading, isSignedIn } = useAuthUser();
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        setMemberRole(null);
        setMemberLoading(false);
        return;
      }
      setMemberLoading(true);
      try {
        const member = await getBusinessMember(user.uid);
        if (active) setMemberRole(member?.role || null);
      } catch {
        if (active) setMemberRole(null);
      } finally {
        if (active) setMemberLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const canManageMaintenance = useMemo(() => MAINTENANCE_ROLES.has(memberRole || ""), [memberRole]);

  return {
    isSignedIn,
    authLoading,
    memberLoading,
    memberRole,
    canManageMaintenance,
  };
}
