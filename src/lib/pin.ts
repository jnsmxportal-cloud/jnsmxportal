/**
 * Why a staff sign-in PIN would be rejected, or null when it's fine.
 * Keep in step with `pinProblem` in supabase/functions/kiosk-admin/index.ts.
 */
export function pinProblem(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return 'The PIN must be exactly 6 digits'
  if (/^(\d)\1{5}$/.test(code)) return 'Too easy to guess — don’t use the same digit six times'
  const d = [...code].map(Number)
  const step = d[1] - d[0]
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) {
    return 'Too easy to guess — don’t use a run like 123456'
  }
  if (/^(\d\d)\1\1$/.test(code) || /^(\d{3})\1$/.test(code)) {
    return 'Too easy to guess — don’t repeat a pattern like 121212'
  }
  return null
}

/** Digits only, at most 6 — for PIN inputs. */
export const pinInput = (raw: string) => raw.replace(/\D/g, '').slice(0, 6)
