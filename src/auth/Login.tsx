import { useRef, useState } from 'react'
import { Storefront, Lightning, CircleNotch, Backspace } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'

const demoAccounts = [
  { label: 'Owner · Gareeth', email: 'gareeth@storeops.demo' },
  { label: 'Team Leader · Ken', email: 'ken@storeops.demo' },
  { label: 'Staff · Amara', email: 'amara@storeops.demo' },
  { label: 'Manager · Maya', email: 'maya@storeops.demo' },
]

function CodePad({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (code: string) => void
  busy: boolean
  error: string | null
}) {
  const [code, setCode] = useState('')
  const submitted = useRef(false)

  const push = (d: string) => {
    if (busy || code.length >= 6) return
    const next = code + d
    setCode(next)
    if (next.length === 6 && !submitted.current) {
      submitted.current = true
      onSubmit(next)
      // allow a fresh attempt after the request settles
      setTimeout(() => {
        submitted.current = false
        setCode('')
      }, 400)
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-center gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`flex h-12 w-9 items-center justify-center rounded-xl border-[1.5px] text-lg font-bold ${
              code.length === i ? 'border-brand' : 'border-ink/15'
            } ${code[i] ? 'bg-canvas' : 'bg-white'}`}
          >
            {busy ? '·' : (code[i] ?? '')}
          </div>
        ))}
      </div>
      {error && (
        <div className="mb-3 rounded-xl bg-danger-soft px-3 py-2.5 text-center text-xs font-medium text-danger">
          {error}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy}
            onClick={() => push(d)}
            className="rounded-xl border border-ink/10 bg-canvas py-3.5 text-[17px] font-bold text-ink active:bg-brand-tint disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          disabled={busy}
          onClick={() => push('0')}
          className="rounded-xl border border-ink/10 bg-canvas py-3.5 text-[17px] font-bold text-ink active:bg-brand-tint disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          disabled={busy || !code.length}
          onClick={() => setCode(code.slice(0, -1))}
          className="flex items-center justify-center rounded-xl border border-ink/10 bg-canvas text-slate active:bg-brand-tint disabled:opacity-40"
          aria-label="Delete last digit"
        >
          <Backspace size={20} />
        </button>
      </div>
      <div className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Your personal 6-digit staff code signs you in instantly.
        <br />
        Lost it? Ask your manager to issue a new one.
      </div>
    </div>
  )
}

export default function Login() {
  const [mode, setMode] = useState<'code' | 'email'>('code')
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

  const signInWithCode = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('kiosk-login', {
        body: { code },
      })
      // supabase-js surfaces non-2xx as FunctionsHttpError — read the real message
      if (fnErr) {
        let msg = 'Could not sign in — try again'
        const ctx = (fnErr as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            msg = ((await ctx.json()) as { error?: string }).error ?? msg
          } catch {
            /* keep fallback */
          }
        }
        throw new Error(msg)
      }
      const { token_hash, error: apiErr } = data as { token_hash?: string; error?: string }
      if (apiErr || !token_hash) throw new Error(apiErr ?? 'Could not sign in — try again')
      const { error: otpErr } = await supabase.auth.verifyOtp({ type: 'email', token_hash })
      if (otpErr) throw otpErr
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in — try again')
    } finally {
      setBusy(false)
    }
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

        <div className="rounded-3xl bg-white p-6">
          <div className="mb-5 flex gap-0.5 rounded-[12px] bg-canvas p-[3px]">
            {(
              [
                ['code', 'Staff code'],
                ['email', 'Email & password'],
              ] as const
            ).map(([m, l]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className={`flex-1 rounded-[10px] py-2 text-[12.5px] font-semibold transition ${
                  mode === m ? 'bg-white text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {mode === 'code' ? (
            <CodePad onSubmit={signInWithCode} busy={busy} error={error} />
          ) : (
            <form
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
          )}
        </div>
      </div>
    </div>
  )
}
