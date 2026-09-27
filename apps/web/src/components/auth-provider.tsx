'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  beginSignIn,
  getAccessToken,
  isOidcConfigured,
  signOut,
  subscribeToAuthChanges,
} from '@/lib/auth/oidc-client';

type AuthContextValue = {
  configured: boolean;
  authenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const configured = isOidcConfigured();

  useEffect(() => {
    const sync = () => setAuthenticated(getAccessToken() !== null);
    sync();
    return subscribeToAuthChanges(sync);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      authenticated,
      signIn: () => beginSignIn(`${window.location.pathname}${window.location.search}`),
      signOut,
    }),
    [authenticated, configured],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
