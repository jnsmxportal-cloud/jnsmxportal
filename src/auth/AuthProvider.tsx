import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { disablePushOnSignOut } from '../lib/push'
import type { Profile, Store } from '../lib/types'
import { effectivePermissions, type PermissionKey, type Role } from '../data/roles'

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  /** the admin-defined role behind profile.role_id (or the base role's built-in) */
  role: Role | null
  /** feature permission check — the base role's data access still applies underneath */
  can: (key: PermissionKey) => boolean
  stores: Store[]
  myStoreIds: string[]
  loading: boolean
  loadError: string | null
  profileMissing: boolean
  retry: () => void
  /** Re-read the store list (after an owner edits a geofence, or on a realtime change). */
  refreshStores: () => Promise<void>
  /** Re-read roles (after the owner edits one in Admin → Roles). */
  refreshRoles: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  session: null,
  profile: null,
  role: null,
  can: () => false,
  stores: [],
  myStoreIds: [],
  loading: true,
  loadError: null,
  profileMissing: false,
  retry: () => {},
  refreshStores: async () => {},
  refreshRoles: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [myStoreIds, setMyStoreIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [profileMissing, setProfileMissing] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setProfileMissing(false)
        setLoadError(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const uid = session.user.id
        const [profRes, storesRes, usrRes, rolesRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
          supabase.from('stores').select('*').order('name'),
          supabase.from('user_store_roles').select('store_id').eq('user_id', uid),
          supabase.from('roles').select('*'),
        ])
        if (cancelled) return
        if (profRes.error) throw profRes.error
        if (storesRes.error) throw storesRes.error
        if (usrRes.error) throw usrRes.error
        // roles are additive: a missing table (pre-migration) must not block sign-in
        if (rolesRes.error) console.warn('roles unavailable —', rolesRes.error.message)
        const prof = (profRes.data as Profile) ?? null
        const allStores = (storesRes.data as Store[]) ?? []
        setProfile(prof)
        setProfileMissing(!prof)
        setStores(allStores)
        setRoles((rolesRes.data as Role[]) ?? [])
        const assigned = (usrRes.data ?? []).map((r: { store_id: string }) => r.store_id)
        setMyStoreIds(prof?.role === 'owner' ? allStores.map((s) => s.id) : assigned)
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : 'Could not load your account')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // keyed by user id, not session identity: token refreshes (fired on every
    // window refocus) must not re-trigger the account load — the Splash it
    // causes unmounts the route tree and wipes in-progress form state
  }, [session?.user.id, loadNonce])

  // presence heartbeat (FR-8.1 staff status): update while the tab is visible
  useEffect(() => {
    if (!session || !profile) return
    const uid = session.user.id
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      supabase
        .from('profiles')
        .update({ is_online: true, last_seen_at: new Date().toISOString() })
        .eq('id', uid)
        .then(({ error }) => {
          if (error) console.warn('presence heartbeat failed —', error.message)
        })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') beat()
    }
    const onPageHide = () => {
      // best-effort: may not complete if the page is discarded mid-flight
      supabase
        .from('profiles')
        .update({ is_online: false })
        .eq('id', uid)
        .then(() => {})
    }
    beat()
    const iv = setInterval(beat, 120_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [session?.user.id, profile?.id])

  // quiet re-read of stores — does NOT toggle `loading`, so the route tree stays mounted
  const refreshRoles = useCallback(async () => {
    const { data, error } = await supabase.from('roles').select('*')
    if (!error) setRoles((data as Role[]) ?? [])
  }, [])

  // the member's role row: the one they hold, else the built-in for their base role
  const role = useMemo<Role | null>(() => {
    if (!profile) return null
    return (
      roles.find((r) => r.id === profile.role_id) ??
      roles.find((r) => r.is_system && r.base_role === profile.role) ??
      null
    )
  }, [roles, profile])
  const permissions = useMemo(
    () => (profile ? effectivePermissions(role, profile.role) : new Set<PermissionKey>()),
    [role, profile],
  )
  const can = useCallback((key: PermissionKey) => permissions.has(key), [permissions])

  const refreshStores = useCallback(async () => {
    const { data, error } = await supabase.from('stores').select('*').order('name')
    if (error) {
      console.warn('store refresh failed —', error.message)
      return
    }
    const list = (data as Store[]) ?? []
    setStores(list)
    setMyStoreIds((prev) => (profile?.role === 'owner' ? list.map((s) => s.id) : prev))
  }, [profile?.role])

  // keep store fences live across devices (owner edits in Admin → staff phones update)
  useEffect(() => {
    if (!session) return
    const ch = supabase
      .channel('stores-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, () => {
        void refreshStores()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [session?.user.id, refreshStores])

  const retry = () => setLoadNonce((n) => n + 1)

  const signOut = async () => {
    try {
      if (session) {
        await supabase.from('profiles').update({ is_online: false }).eq('id', session.user.id)
      }
      await disablePushOnSignOut()
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' })
    } catch (e) {
      console.warn('sign-out cleanup failed —', e)
    }
    // 'local': sign out THIS device only. The default ('global') revokes every session of the
    // account, so one person signing out of a shared login broke everyone else's session.
    await supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        role,
        can,
        stores,
        myStoreIds,
        loading,
        loadError,
        profileMissing,
        retry,
        refreshStores,
        refreshRoles,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
