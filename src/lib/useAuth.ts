import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Staff } from '../types';

export type AuthAal = 'aal1' | 'aal2' | null;

interface AuthState {
  user: User | null;
  staffRecord: Staff | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Current authenticator assurance level. aal1 = password only,
   *  aal2 = password + verified MFA factor challenge passed. */
  currentAal: AuthAal;
  /** AAL the session would reach if the user passed any pending challenges.
   *  When `currentAal === 'aal1'` and `nextAal === 'aal2'`, the user has a
   *  verified MFA factor and we should demand a challenge before letting
   *  them into protected areas. */
  nextAal: AuthAal;
  initialize: () => Promise<void>;
  refreshStaff: () => Promise<void>;
  refreshAal: () => Promise<void>;
  signOut: () => Promise<void>;
}

async function fetchStaffFor(userId: string): Promise<Staff | null> {
  const { data } = await supabase
    .from('staff')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as Staff | null) ?? null;
}

async function fetchAal(): Promise<{ currentAal: AuthAal; nextAal: AuthAal }> {
  // getAuthenticatorAssuranceLevel can throw on stale/missing sessions —
  // in that case treat as no-AAL (will be re-evaluated on next login).
  try {
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return { currentAal: null, nextAal: null };
    return {
      currentAal: (data.currentLevel as AuthAal) ?? null,
      nextAal: (data.nextLevel as AuthAal) ?? null,
    };
  } catch {
    return { currentAal: null, nextAal: null };
  }
}

let listenerBound = false;

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  staffRecord: null,
  isLoading: true,
  isAuthenticated: false,
  currentAal: null,
  nextAal: null,

  initialize: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      set({
        user: null,
        staffRecord: null,
        isLoading: false,
        isAuthenticated: false,
        currentAal: null,
        nextAal: null,
      });
    } else {
      const [staff, aal] = await Promise.all([
        fetchStaffFor(session.user.id),
        fetchAal(),
      ]);
      set({
        user: session.user,
        staffRecord: staff,
        isLoading: false,
        isAuthenticated: true,
        currentAal: aal.currentAal,
        nextAal: aal.nextAal,
      });
    }

    if (!listenerBound) {
      listenerBound = true;
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (!newSession) {
          set({
            user: null,
            staffRecord: null,
            isAuthenticated: false,
            currentAal: null,
            nextAal: null,
          });
          return;
        }
        // Wrap the parallel fetches so a transient network blip can't leave
        // us with `isAuthenticated: true` but `user` not set — that mismatch
        // was causing the Login routing useEffect to spin during MFA verify.
        try {
          const [staff, aal] = await Promise.all([
            fetchStaffFor(newSession.user.id),
            fetchAal(),
          ]);
          set({
            user: newSession.user,
            staffRecord: staff,
            isAuthenticated: true,
            currentAal: aal.currentAal,
            nextAal: aal.nextAal,
          });
        } catch (err) {
          console.error('[useAuth] post-auth fetch failed', err);
          // Best-effort: still flip authenticated so the consumer can react.
          // The next visit (or refreshStaff/refreshAal call) will re-resolve.
          set({
            user: newSession.user,
            isAuthenticated: true,
          });
        }
      });
    }
  },

  refreshStaff: async () => {
    const { user } = get();
    if (!user) return;
    const staff = await fetchStaffFor(user.id);
    set({ staffRecord: staff });
  },

  refreshAal: async () => {
    const aal = await fetchAal();
    set({ currentAal: aal.currentAal, nextAal: aal.nextAal });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({
      user: null,
      staffRecord: null,
      isAuthenticated: false,
      currentAal: null,
      nextAal: null,
    });
  },
}));

export function hasStaffAccess(staff: Staff | null): boolean {
  return (
    !!staff &&
    (staff.role === 'staff' ||
      staff.role === 'manager' ||
      staff.role === 'admin')
  );
}

export function hasAdminAccess(staff: Staff | null): boolean {
  return !!staff && staff.role === 'admin';
}
