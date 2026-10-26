import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** needsConfirmation: Supabase emailed a link the user must click before signing in. */
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Load the profile row. If it's missing (the sign-up trigger wasn't set up
   * in Supabase), create it from the sign-up metadata so the app still works.
   */
  const fetchProfile = async (u: User) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
      if (data) {
        setProfile(data);
        return;
      }
      if (error) console.warn('Could not read profile:', error.message);

      const fallback = {
        id: u.id,
        email: u.email ?? '',
        full_name: (u.user_metadata?.full_name as string) || u.email?.split('@')[0] || '',
        avatar_url: null,
        created_at: u.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setProfile(fallback);
      // Best effort: store it so it survives a reload. Fails quietly if the
      // profiles table doesn't exist yet.
      const { error: insertError } = await supabase.from('profiles').upsert({ id: u.id, email: fallback.email, full_name: fallback.full_name });
      if (insertError) console.warn('Could not save profile:', insertError.message);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || ''
        }
      }
    });
    // With "Confirm email" on, Supabase creates the user but no session.
    return { error, needsConfirmation: !error && !data?.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: 'No user logged in' };

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, ...updates });

    if (!error) {
      setProfile((p) => (p ? { ...p, ...updates } : p));
    }

    return { error };
  };
  const value = {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}