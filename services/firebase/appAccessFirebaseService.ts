"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { settingsDocPath } from "@/lib/firebase/paths";
import { APP_ACCESS_PASSWORD_VERSION } from "@/lib/appAccess";

export type AppAccessSettingsRecord = {
  enabled: boolean;
  passwordVersion: number;
  passwordHash: string;
  passwordSalt: string;
  updatedAt: string;
  requiresSetup: boolean;
};

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

export async function getAppAccessSettings(): Promise<AppAccessSettingsRecord | null> {
  const snap = await getDoc(doc(requireDb(), settingsDocPath(BUSINESS_ID, "appAccess")));
  if (!snap.exists()) {
    return {
      enabled: true,
      passwordVersion: APP_ACCESS_PASSWORD_VERSION,
      passwordHash: "",
      passwordSalt: "",
      updatedAt: "",
      requiresSetup: true,
    };
  }
  const data = snap.data() as Record<string, unknown>;
  const enabled = data?.enabled !== false;
  const passwordVersion = Number(data.passwordVersion);
  const passwordHash = typeof data.passwordHashV2 === "string" ? data.passwordHashV2 : "";
  const passwordSalt = typeof data.passwordSalt === "string" ? data.passwordSalt : "";
  const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : "";
  const hasV2Password = enabled && passwordVersion === APP_ACCESS_PASSWORD_VERSION && Boolean(passwordHash && passwordSalt);
  return {
    enabled,
    passwordVersion: hasV2Password ? passwordVersion : APP_ACCESS_PASSWORD_VERSION,
    passwordHash,
    passwordSalt,
    updatedAt,
    requiresSetup: !hasV2Password,
  };
}

export async function saveAppAccessPassword(input: { passwordHash: string; passwordSalt: string }): Promise<void> {
  await setDoc(
    doc(requireDb(), settingsDocPath(BUSINESS_ID, "appAccess")),
    {
      enabled: true,
      passwordVersion: APP_ACCESS_PASSWORD_VERSION,
      passwordHashV2: input.passwordHash,
      passwordSalt: input.passwordSalt,
      passwordHash: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}
