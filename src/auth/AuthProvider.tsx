import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Store } from '../lib/types'

interface AuthCtx {
  session: Session | null
  profile: Profile | null
  stores: Store[]
  myStoreIds: string[]
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  session: null,
  profile: null,
  stores: [],
  myStoreIds: [],
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [myStoreIds, setMyStoreIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      const uid = session.user.id
      const [{ data: prof }, { data: allStores }, { data: usr }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('stores').select('*').order('name'),
        supabase.from('user_store_roles').select('store_id').eq('user_id', uid),
      ])
      if (cancelled) return
      setProfile((prof as Profile) ?? null)
      setStores((allStores as Store[]) ?? [])
      const assigned = (usr ?? []).map((r: { store_id: string }) => r.store_id)
      setMyStoreIds(
        prof && (prof as Profile).role === 'owner'
          ? ((allStores as Store[]) ?? []).map((s) => s.id)
          : assigned,
      )
      setLoading(false)
      // presence: mark online (FR-8.1 staff status)
      supabase
        .from('profiles')
        .update({ is_online: true, last_seen_at: new Date().toISOString() })
        .eq('id', uid)
        .then(() => {})
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  const signOut = async () => {
    if (session) {
      await supabase.from('profiles').update({ is_online: false }).eq('id', session.user.id)
    }
    await supabase.auth.signOut()
  }

  return (
    <Ctx.Provider value={{ session, profile, stores, myStoreIds, loading, signOut }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
