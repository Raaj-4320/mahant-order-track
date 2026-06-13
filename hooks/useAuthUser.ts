"use client";
import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { mapFirebaseAuthError } from "@/lib/firebase/authErrors";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) { setLoading(false); return; }
    let attemptedAnonymous = false;
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setLoading(false);
        return;
      }

      if (!attemptedAnonymous) {
        attemptedAnonymous = true;
        try {
          await signInAnonymously(auth);
          return;
        } catch {
          // Fall back to unsigned mode without showing auth UI.
        }
      }

      setUser(null);
      setLoading(false);
    });
  }, []);

  const signIn = async (email: string, password: string): Promise<UserCredential> => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth not configured.");
    setError(null);
    try { return await signInWithEmailAndPassword(auth, email, password); }
    catch (e) { const m = mapFirebaseAuthError(e); setError(m); throw new Error(m); }
  };

  const signUp = async (email: string, password: string): Promise<UserCredential> => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth not configured.");
    setError(null);
    try { return await createUserWithEmailAndPassword(auth, email, password); }
    catch (e) { const m = mapFirebaseAuthError(e); setError(m); throw new Error(m); }
  };

  const logout = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
  };

  const changePasswordWithReauth = async (currentPassword: string, newPassword: string) => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser || !auth.currentUser.email) throw new Error("You must be signed in to change password.");
    setError(null);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
    } catch (e) {
      const m = mapFirebaseAuthError(e);
      setError(m);
      throw new Error(m);
    }
  };

  const deleteCurrentUser = async () => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return;
    await deleteUser(auth.currentUser);
  };

  return { user, loading, error, isSignedIn: !!user, signIn, signUp, logout, changePasswordWithReauth, deleteCurrentUser };
}
