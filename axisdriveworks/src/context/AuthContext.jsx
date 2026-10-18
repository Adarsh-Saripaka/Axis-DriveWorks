import { createContext, useContext, useState, useEffect } from "react";
import { signInWithGoogle, signOutFromFirebase, isFirebaseConfigured } from "../lib/firebase";
import { apiRequest } from "../Api/FetchApi";

const AuthContext = createContext({
  user: null,
  loading: true,
  isFirebaseConfigured: false,
  loginWithGoogle: async () => {},
  logout: async () => {},
  checkAuth: async () => {}
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check existing session cookie on load
  const checkAuth = async () => {
    try {
      const data = await apiRequest("/auth/me");
      if (data?.authenticated && data?.user) {
        setUser(data.user);
        return data.user;
      }
      setUser(null);
      return null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // Group 6 #11: When any API request encounters 401 Session expired, clear client session state
    const handleAuthExpired = () => {
      setUser(null);
    };
    window.addEventListener("auth:expired", handleAuthExpired);
    return () => window.removeEventListener("auth:expired", handleAuthExpired);
  }, []);

  const loginWithGoogle = async () => {
    // 1. Authenticate with Google via Firebase OAuth popup
    const firebaseUser = await signInWithGoogle();
    const idToken = await firebaseUser.getIdToken();

    // 2. Exchange ID token with backend for hardened HttpOnly session cookie
    // Token Separation: We do not store Google idToken or accessToken on the client!
    try {
      const data = await apiRequest("/auth/session", {
        method: "POST",
        body: { idToken }
      });
      setUser(data.user);
      return data.user;
    } catch (err) {
      await signOutFromFirebase();
      throw new Error(err.message || "Failed to establish secure server session.");
    }
  };

  const logout = async () => {
    try {
      await apiRequest("/auth/logout", {
        method: "POST"
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
