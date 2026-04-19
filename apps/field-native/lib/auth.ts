import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { supabase } from './supabase';

export type AuthStatus =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; session: Session; user: User };

export function useAuth(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(
        data.session
          ? { state: 'signed-in', session: data.session, user: data.session.user }
          : { state: 'signed-out' }
      );
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(
        session
          ? { state: 'signed-in', session, user: session.user }
          : { state: 'signed-out' }
      );
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return status;
}

export async function signInWithMagicLink(email: string) {
  const redirectTo = Linking.createURL('auth-callback');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  return { error, redirectTo };
}

export async function exchangeCode(code: string) {
  return supabase.auth.exchangeCodeForSession(code);
}

export async function signOut() {
  return supabase.auth.signOut();
}
