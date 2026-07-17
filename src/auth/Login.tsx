import { useState } from 'react'
import { Storefront, Lightning, CircleNotch } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'

const demoAccounts = [
  { label: 'Owner · Gareeth', email: 'gareeth@storeops.demo' },
  { label: 'Team Leader · Ken', email: 'ken@storeops.demo' },
  { label: 'Staff · Amara', email: 'amara@storeops.demo' },
  { label: 'Manager · Maya', email: 'maya@storeops.demo' },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const signIn = async (e: string, p: string) => {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: e, password: p })
    if (err) setError(err.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-navy px-6 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand">
            <Storefront size={30} weight="bold" color="#fff" />
          </div>
          <h1 className="text-[24px] font-bold tracking-tight text-white">Operations Engine</h1>
          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
            <Lightning size={13} weight="fill" color="#16B364" />
            Installable PWA · Offline-first · Convenience Store Ops
          </div>
        </div>

        <form
          className="rounded-3xl bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault()
            signIn(email, password)
          }}
        >
          <label className="mb-1.5 block text-xs font-semibold text-slate">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@store.com"
            className="mb-4 w-full rounded-xl border-[1.5px] border-ink/15 p-3 text-sm outline-none focus:border-brand"
            autoComplete="email"
          />
          <label className="mb-1.5 block text-xs font-semibold text-slate">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mb-4 w-full rounded-xl border-[1.5px] border-ink/15 p-3 text-sm outline-none focus:border-brand"
            autoComplete="current-password"
          />
          {error && (
            <div className="mb-4 rounded-xl bg-danger-soft px-3 py-2.5 text-xs font-medium text-danger">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-brand p-3.5 text-[15px] font-bold text-white disabled:opacity-50"
          >
            {busy && <CircleNotch size={17} className="animate-spin" />}
            Sign in
          </button>

          <div className="mt-6 border-t border-line pt-5">
            <div className="mb-2.5 text-center text-[10.5px] font-bold uppercase tracking-wider text-muted">
              Demo accounts · password StoreOps!2026
            </div>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  disabled={busy}
                  onClick={() => signIn(a.email, 'StoreOps!2026')}
                  className="rounded-xl border border-ink/10 bg-canvas px-2 py-2.5 text-[11.5px] font-semibold text-ink hover:border-brand/50 hover:bg-brand-tint"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
