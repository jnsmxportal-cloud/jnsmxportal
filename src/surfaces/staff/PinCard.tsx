import { useState } from 'react'
import { Password } from '@phosphor-icons/react'
import { useMyPin, useSetMyPin } from '../../data/rota'
import { pinInput, pinProblem } from '../../lib/pin'
import { useToast } from '../../components/Toast'

const pinCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 font-mono text-base tracking-[.3em] outline-none focus:border-brand'
const label = 'mb-1 block text-[11.5px] font-semibold text-slate'

/** Profile card: staff choose (or change) their own 6-digit sign-in PIN. */
export default function PinCard() {
  const { data, isLoading, error } = useMyPin()
  const setPin = useSetMyPin()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [pin, setNewPin] = useState('')
  const [again, setAgain] = useState('')
  const hasPin = !!data?.has_code

  const problem =
    pin.length === 6 ? pinProblem(pin) : null
  const mismatch = again.length === 6 && again !== pin
  const ready =
    (!hasPin || current.length === 6) && pin.length === 6 && !problem && again === pin

  const reset = () => {
    setOpen(false)
    setCurrent('')
    setNewPin('')
    setAgain('')
  }

  const save = () =>
    setPin.mutate(
      { code: pin, current: hasPin ? current : undefined },
      {
        onSuccess: () => {
          toast(hasPin ? 'PIN changed — use the new one next time you sign in' : 'PIN set — use it on the Staff code keypad')
          reset()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div className="mb-3.5 rounded-2xl border border-line bg-white p-[15px]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-bold">
            <Password size={16} color="#FF5A2D" weight="fill" /> Sign-in PIN
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {isLoading
              ? 'Checking…'
              : error
                ? 'Can’t check right now — you may be offline'
                : hasPin
                  ? 'Your 6-digit PIN signs you in on the Staff code keypad.'
                  : 'No PIN yet — set one to sign in without your email.'}
          </div>
        </div>
        {!open && !isLoading && !error && (
          <button
            onClick={() => setOpen(true)}
            className="flex-none rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
          >
            {hasPin ? 'Change' : 'Set PIN'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-ink/5 pt-3">
          {hasPin && (
            <div>
              <label className={label} htmlFor="pin-current">Current PIN</label>
              <input
                id="pin-current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(pinInput(e.target.value))}
                inputMode="numeric"
                autoComplete="current-password"
                className={pinCls}
              />
            </div>
          )}
          <div>
            <label className={label} htmlFor="pin-new">New PIN</label>
            <input
              id="pin-new"
              type="password"
              value={pin}
              onChange={(e) => setNewPin(pinInput(e.target.value))}
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="6 digits"
              className={pinCls}
            />
          </div>
          <div>
            <label className={label} htmlFor="pin-again">New PIN again</label>
            <input
              id="pin-again"
              type="password"
              value={again}
              onChange={(e) => setAgain(pinInput(e.target.value))}
              inputMode="numeric"
              autoComplete="new-password"
              className={pinCls}
            />
          </div>
          <div className={`min-h-[16px] text-[11px] ${problem || mismatch ? 'text-danger' : 'text-muted'}`}>
            {problem ?? (mismatch ? 'The two PINs don’t match' : 'Pick something only you know — not 123456 or your birthday.')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 rounded-xl border border-ink/15 p-2.5 text-[13px] font-semibold text-slate"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!ready || setPin.isPending}
              className="flex-1 rounded-xl bg-brand p-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {setPin.isPending ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
          {hasPin && (
            <div className="text-[11px] text-muted">Forgot your current PIN? Ask your manager to reset it.</div>
          )}
        </div>
      )}
    </div>
  )
}
