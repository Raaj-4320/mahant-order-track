import { isFirebaseConfigured } from "@/lib/firebase/client";
import { deleteEverythingForBusiness } from "@/services/firebase/devResetFirebaseService";

const DEV_RESET_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_RESET === "true";

export async function runDevReset(options?: { includeSettings?: boolean }) {
  if (!DEV_RESET_ENABLED) throw new Error("Dev reset is disabled.");
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");
  return deleteEverythingForBusiness({ includeSettings: options?.includeSettings === true });
}

export function isDevResetEnabled() {
  return DEV_RESET_ENABLED;
}
