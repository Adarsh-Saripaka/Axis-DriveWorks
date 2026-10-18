import { createContext, useContext, useState, useEffect } from "react";
import { signInWithGoogle, signOutFromFirebase, isFirebaseConfigured } from "../lib/firebase";

const AuthContext = createContext({
  user: null,
  loading: true,
  isFirebaseConfigured: false,
  loginWithGoogle: async () => {},
  logout: async () => {},
  checkAuth: async () => {}
});

const RAW_BASE = (typeof import.meta !== "undefined" && import.meta.env)
  ? (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
  : "http://localhost:5000";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api`;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check existing session cookie on load
  const checkAuth = async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        method: "GET",
        credentials: "include"
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          return data.user;
        }
      }
      setUser(null);
      return null;
    } catch (err) {
      console.warn("Session check failed:", err);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const loginWithGoogle = async () => {
    // 1. Authenticate with Google via Firebase OAuth popup
    const firebaseUser = await signInWithGoogle();
    const idToken = await firebaseUser.getIdToken();

    // 2. Exchange ID token with backend for hardened HttpOnly session cookie
    // Token Separation: We do not store Google idToken or accessToken on the client!
    const res = await fetch(`${BASE_URL}/auth/session`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Requested-With": "fetch"
      },
      body: JSON.stringify({ idToken }),
      credentials: "include"
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      await signOutFromFirebase();
      throw new Error(err.error || "Failed to establish secure server session.");
    }

    const data = await res.json();
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { "X-Requested-With": "fetch" },
        credentials: "include"
      });
    } catch (err) {
      console.warn("Backend logout failed:", err);
    }
    await signOutFromFirebase();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isFirebaseConfigured,
        loginWithGoogle,
        logout,
        checkAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
