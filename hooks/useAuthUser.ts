"use client";
import { useEffect, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) { setLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
  }, []);

  const signIn = async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth not configured.");
    setError(null);
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (e) { const m = e instanceof Error ? e.message : "Sign in failed"; setError(m); throw e; }
  };

  const signUp = async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth not configured.");
    setError(null);
    try { await createUserWithEmailAndPassword(auth, email, password); }
    catch (e) { const m = e instanceof Error ? e.message : "Sign up failed"; setError(m); throw e; }
  };

  const logout = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
  };

  return { user, loading, error, isSignedIn: !!user, signIn, signUp, logout };
}
