"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { settingsDocPath } from "@/lib/firebase/paths";

type AppAccessSettingsRecord = {
  enabled: boolean;
  passwordHash: string;
  updatedAt: string;
};

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

export async function getAppAccessSettings(): Promise<AppAccessSettingsRecord | null> {
  const snap = await getDoc(doc(requireDb(), settingsDocPath(BUSINESS_ID, "appAccess")));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<AppAccessSettingsRecord>;
  if (!data?.enabled || !data.passwordHash) return null;
  return {
    enabled: true,
    passwordHash: String(data.passwordHash),
    updatedAt: String(data.updatedAt || ""),
  };
}

export async function saveAppAccessPassword(passwordHash: string): Promise<void> {
  await setDoc(
    doc(requireDb(), settingsDocPath(BUSINESS_ID, "appAccess")),
    {
      enabled: true,
      passwordHash,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}
