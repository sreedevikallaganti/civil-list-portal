// src/contexts/AuthContext.tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ClientResponseError } from 'pocketbase';
import { logActivity } from '@/lib/activity';
import {
  AUTH_COLLECTION,
  getCurrentUser,
  getAuthErrorMessage,
  pb,
  type PortalUser,
} from '@/lib/pocketbase';

/** PocketBase's built-in owner accounts (dashboard superusers). */
const SUPERUSERS = '_superusers';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export type LoginResult =
  | { ok: true; user: PortalUser }
  | { ok: false; error: string };

interface AuthContextValue {
  /** The currently signed-in user (null when logged out). */
  user: PortalUser | null;
  /** True while the saved session is being restored/validated on load. */
  isLoading: boolean;
  /** Convenience flag — true when a user is signed in. */
  isAuthenticated: boolean;
  /** Signs a user in with email + password against PocketBase. */
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Clears the PocketBase session and signs the user out. */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ================================================================== */
/*  Provider                                                           */
/* ================================================================== */

export function AuthProvider({ children }: { children: ReactNode }) {
  // Starts as "loading" on both server and client render → no hydration
  // mismatch; the real state is resolved on mount.
  const [user, setUser] = useState<PortalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /* ---------------------------------------------------------------- */
  /* 1. Restore + validate the saved session on first load             */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (pb.authStore.isValid) {
        // A token exists (persisted by the SDK in localStorage).
        // Validate it against PocketBase — catches expired/revoked tokens.
        try {
          // refresh against the collection the session came from ("users" or PocketBase "_superusers")
          const from = (pb.authStore.record as { collectionName?: string } | null)?.collectionName;
          await pb.collection(from === SUPERUSERS ? SUPERUSERS : AUTH_COLLECTION).authRefresh();
          if (mounted) setUser(getCurrentUser());
        } catch (error) {
          if (error instanceof ClientResponseError && error.status === 0) {
            // PocketBase temporarily unreachable — keep the local session;
            // connection problems will surface on the next real request.
            if (mounted) setUser(getCurrentUser());
          } else {
            // Token invalid / expired / revoked → clear the session.
            pb.authStore.clear();
            if (mounted) setUser(null);
          }
        }
      }

      if (mounted) setIsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* 2. Keep React state in sync with the PocketBase auth store        */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    // Fires on login, logout and any other authStore change.
    const unsubscribe = pb.authStore.onChange(() => {
      setUser(getCurrentUser());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* 3. Login — ONE sign-in for everyone                               */
  /*    Tries the app's "users" collection (Admin, Super Admin, Editor, */
  /*    Viewer — set by the role field). If the email/password isn't    */
  /*    there, tries PocketBase's own "_superusers" (database owners).  */
  /* ---------------------------------------------------------------- */
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const id = email.trim().toLowerCase();
      try {
        try {
          await pb.collection(AUTH_COLLECTION).authWithPassword(id, password);
        } catch (first) {
          // 400 = wrong email/password for "users" → it may be a PocketBase superuser
          if (!(first instanceof ClientResponseError) || first.status !== 400) throw first;
          try {
            await pb.collection(SUPERUSERS).authWithPassword(id, password);
          } catch {
            throw first; // neither matched → one plain "invalid email or password"
          }
        }

        const authUser = getCurrentUser();

        // Optional gate: your users collection has a `status` field
        // ("Active" for both records in your screenshots). Blocks
        // deactivated accounts. Delete this block if you don't want it.
        if (authUser?.status && authUser.status.toLowerCase() !== 'active') {
          pb.authStore.clear(); // discard the session we just received
          return {
            ok: false,
            error:
              'This account is deactivated and is not authorized to access the Civillist Portal.',
          };
        }

        if (!authUser) {
          pb.authStore.clear();
          return {
            ok: false,
            error: 'Authentication failed. Please try again.',
          };
        }

        setUser(authUser);
        logActivity('login', 'auth', `${authUser.name || authUser.email || 'User'} signed in`, authUser.id);
        return { ok: true, user: authUser };
      } catch (error) {
        pb.authStore.clear();
        return { ok: false, error: getAuthErrorMessage(error) };
      }
    },
    []
  );

  /* ---------------------------------------------------------------- */
  /* 4. Logout                                                         */
  /* ---------------------------------------------------------------- */
  const logout = useCallback(() => {
    // record the sign-out while the session is still valid, then remove token + record
    const who = pb.authStore.record as { id?: string; name?: string; email?: string } | null;
    if (pb.authStore.isValid) logActivity('logout', 'auth', `${who?.name || who?.email || 'User'} signed out`, who?.id || '');
    pb.authStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
    }),
    [user, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ================================================================== */
/*  Hook                                                               */
/* ================================================================== */

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }

  return context;
}