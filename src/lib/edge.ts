import { supabase } from './supabase'

export const SESSION_ENDED_MSG =
  'You were signed out (this account was signed out on another device). Please sign in again.'

async function invokeOnce(name: string, body: unknown) {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
  if (!error) {
    const apiErr = (data as { error?: string } | null)?.error
    return { data, status: 200, message: apiErr ?? null }
  }
  const ctx = (error as { context?: Response }).context
  const status = ctx && typeof ctx.status === 'number' ? ctx.status : 0
  let message: string | null = null
  if (ctx && typeof ctx.json === 'function') {
    try {
      message = ((await ctx.json()) as { error?: string }).error ?? null
    } catch {
      /* not JSON */
    }
  }
  return { data: null, status, message: message ?? error.message ?? 'Request failed' }
}

/**
 * Call one of our edge functions and surface its own error message.
 *
 * Our functions answer 401 only when the caller's session no longer exists on the server — e.g.
 * someone signed this same account out on another device. Normal pages keep working on such a
 * session (they only check the token's signature) so the app looks signed in; here we try one
 * refresh and, if the session really is gone, sign this device out with a clear message instead
 * of a bare "Unauthorized".
 */
export async function invokeEdge<T>(name: string, body: unknown): Promise<T> {
  let res = await invokeOnce(name, body)
  if (res.status === 401) {
    const { error: refreshErr } = await supabase.auth.refreshSession()
    if (!refreshErr) res = await invokeOnce(name, body)
    if (refreshErr || res.status === 401) {
      await supabase.auth.signOut({ scope: 'local' })
      throw new Error(SESSION_ENDED_MSG)
    }
  }
  if (res.message) throw new Error(res.message)
  return res.data as T
}
