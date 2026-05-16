import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase/client";
import { businessPath } from "@/lib/firebase/paths";

const BUSINESS_ID = process.env.NEXT_PUBLIC_FIREBASE_BUSINESS_ID ?? "mahant";

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

export async function bootstrapBusinessForUser(uid: string, email?: string | null) {
  if (!uid) throw new Error("User uid required.");
  const db = requireDb();
  const now = new Date().toISOString();
  const bizRef = doc(db, businessPath(BUSINESS_ID));
  const memberRef = doc(db, `${businessPath(BUSINESS_ID)}/members/${uid}`);

  const bizSnap = await getDoc(bizRef);
  if (!bizSnap.exists()) {
    await setDoc(bizRef, { id: BUSINESS_ID, name: "Mahant", ownerUid: uid, createdAt: now, updatedAt: now }, { merge: true });
  }

  await setDoc(memberRef, { uid, role: "owner", active: true, email: email || null, createdAt: now }, { merge: true });
}

export async function getBusinessMember(uid: string) {
  if (!uid) return null;
  const db = requireDb();
  const snap = await getDoc(doc(db, `${businessPath(BUSINESS_ID)}/members/${uid}`));
  if (!snap.exists()) return null;
  return snap.data() as { uid: string; role: string; active: boolean };
}
