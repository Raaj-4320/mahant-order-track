"use client";

export function useBusinessAccess() {
  return {
    isSignedIn: false,
    authLoading: false,
    memberLoading: false,
    memberRole: "owner",
    canManageMaintenance: true,
  };
}
