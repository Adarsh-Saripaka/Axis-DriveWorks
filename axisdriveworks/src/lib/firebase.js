import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  !firebaseConfig.apiKey.includes("your-") &&
  !firebaseConfig.apiKey.includes("YOUR_")
);

let app = null;
let auth = null;

if (isFirebaseConfigured) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
  } catch (err) {
    console.warn("Failed to initialize Firebase app:", err);
  }
}

export { app, auth };
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Triggers Google OAuth popup and returns the Firebase User object.
 */
export async function signInWithGoogle() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error(
      "Firebase is not configured. Please add your Firebase configuration credentials to .env (see .env.example)."
    );
  }

  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Signs out from Firebase client SDK.
 */
export async function signOutFromFirebase() {
  if (auth) {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Firebase sign out error:", err);
    }
  }
}
