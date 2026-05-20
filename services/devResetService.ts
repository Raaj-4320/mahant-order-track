import { isFirebaseConfigured } from "@/lib/firebase/client";
import { isDevResetEnabled } from "@/lib/runtimeConfig";
import { deleteEverythingForBusiness } from "@/services/firebase/devResetFirebaseService";

export async function runDevReset(options?: { includeSettings?: boolean }) {
  if (!isDevResetEnabled()) throw new Error("Dev reset is disabled.");
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");
  return deleteEverythingForBusiness({ includeSettings: options?.includeSettings === true });
}
