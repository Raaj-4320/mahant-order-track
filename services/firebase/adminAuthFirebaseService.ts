import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getFirestoreDb, requireFirebaseBusinessId } from "@/lib/firebase/client";
import { businessPath, memberPath, settingsDocPath } from "@/lib/firebase/paths";

export type BusinessMemberRecord = {
  uid: string;
  name: string;
  email: string | null;
  role: "admin" | "owner" | "staff" | "viewer";
  active: boolean;
  authProvider: "password";
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
};

export type AdminRegistrationState = {
  hasAdmin: boolean;
  adminUid?: string | null;
  adminEmail?: string | null;
  businessId: string;
};

const requireDb = () => {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase not configured.");
  return db;
};

export async function getAdminRegistrationState(): Promise<AdminRegistrationState> {
  const db = requireDb();
  const businessId = requireFirebaseBusinessId();
  const authSnap = await getDoc(doc(db, settingsDocPath(businessId, "auth")));
  if (!authSnap.exists()) {
    return { hasAdmin: false, businessId };
  }
  const data = authSnap.data() as { adminUid?: string | null; adminEmail?: string | null };
  return {
    hasAdmin: true,
    adminUid: data.adminUid ?? null,
    adminEmail: data.adminEmail ?? null,
    businessId,
  };
}

export async function registerFirstAdmin(input: {
  uid: string;
  name: string;
  email: string;
}): Promise<BusinessMemberRecord> {
  const db = requireDb();
  const businessId = requireFirebaseBusinessId();
  const state = await getAdminRegistrationState();
  if (state.hasAdmin) {
    throw new Error("Admin registration is already completed.");
  }

  const now = new Date().toISOString();
  const businessRef = doc(db, businessPath(businessId));
  const memberRef = doc(db, memberPath(businessId, input.uid));
  const authRef = doc(db, settingsDocPath(businessId, "auth"));

  await setDoc(
    businessRef,
    {
      id: businessId,
      name: "Mahant",
      ownerUid: input.uid,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  const member: BusinessMemberRecord = {
    uid: input.uid,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: "admin",
    active: true,
    authProvider: "password",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  await setDoc(memberRef, member, { merge: true });
  await setDoc(
    authRef,
    {
      hasAdmin: true,
      adminUid: input.uid,
      adminEmail: member.email,
      adminName: member.name,
      registrationClosed: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  return member;
}

export async function getBusinessMember(uid: string): Promise<BusinessMemberRecord | null> {
  if (!uid) return null;
  const db = requireDb();
  const businessId = requireFirebaseBusinessId();
  const snap = await getDoc(doc(db, memberPath(businessId, uid)));
  if (!snap.exists()) return null;
  return snap.data() as BusinessMemberRecord;
}

export async function ensureBusinessMemberProfile(input: {
  uid: string;
  email?: string | null;
  name?: string | null;
}): Promise<BusinessMemberRecord> {
  const existing = await getBusinessMember(input.uid);
  if (existing) return existing;

  const db = requireDb();
  const businessId = requireFirebaseBusinessId();
  const now = new Date().toISOString();
  const name =
    input.name?.trim() ||
    input.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "Admin User";

  const businessRef = doc(db, businessPath(businessId));
  const businessSnap = await getDoc(businessRef);
  if (!businessSnap.exists()) {
    try {
      await setDoc(
        businessRef,
        {
          id: businessId,
          name: "Mahant",
          ownerUid: input.uid,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true },
      );
    } catch {
      // A missing business shell should never block an authenticated user's app access.
    }
  }

  const member: BusinessMemberRecord = {
    uid: input.uid,
    name,
    email: input.email?.trim().toLowerCase() || null,
    role: "admin",
    active: true,
    authProvider: "password",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };

  await setDoc(doc(db, memberPath(businessId, input.uid)), member, { merge: true });
  return member;
}

export async function touchBusinessMemberLastLogin(uid: string) {
  if (!uid) return;
  const db = requireDb();
  const businessId = requireFirebaseBusinessId();
  const ref = doc(db, memberPath(businessId, uid));
  await updateDoc(ref, {
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
