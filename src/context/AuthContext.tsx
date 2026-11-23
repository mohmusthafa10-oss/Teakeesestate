import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiClient, CRMUserProfile } from '../services/apiClient';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'unauthorized';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  crmUser: CRMUserProfile | null;
  unreadNotifications: number;
  authStatus: AuthStatus;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [crmUser, setCrmUser] = useState<CRMUserProfile | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);

  const loadCRMProfile = useCallback(async (user: FirebaseUser | null) => {
    if (!user) {
      setCrmUser(null);
      setUnreadNotifications(0);
      setAuthStatus('unauthenticated');
      setAuthError(null);
      return;
    }

    try {
      const profile = await apiClient.getMe();
      setCrmUser(profile.user);
      setUnreadNotifications(profile.unreadNotifications || 0);
      setAuthStatus('authenticated');
      setAuthError(null);
    } catch (err: any) {
      setCrmUser(null);
      setUnreadNotifications(0);
      setAuthStatus('unauthorized');
      setAuthError(
        err?.message ||
          'Your Google account is not authorized to access Teakees CRM.'
      );
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setCrmUser(null);
        setUnreadNotifications(0);
        setAuthStatus('unauthenticated');
        setAuthError(null);
      } else {
        setAuthStatus('loading');
        void loadCRMProfile(fbUser);
      }
    });
    return () => unsub();
  }, [loadCRMProfile]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      const msg = err?.message || 'Sign-in cancelled or blocked by browser popup settings.';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setCrmUser(null);
    setUnreadNotifications(0);
    setAuthStatus('unauthenticated');
    setAuthError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadCRMProfile(auth.currentUser);
  }, [loadCRMProfile]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        crmUser,
        unreadNotifications,
        authStatus,
        authError,
        signInWithGoogle,
        signOutUser,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
