import { createClient } from '@/lib/supabase/client'

/**
 * Invoke a Supabase Edge Function by slug with an optional action + payload.
 * Mirrors the pattern used across hr/auto-recruit, hr/onboarding, hr/performance.
 *
 * Usage:
 *   const res = await engine('core-automation-engine', 'get_users')
 *   const res = await engine('rico-engine', 'assign', { lead_id: '123' })
 */
export async function engine<T = unknown>(
  slug: string,
  action: string,
  payload?: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase.functions.invoke(slug, {
      body: { action, payload: payload ?? {} },
    })

    if (error) {
      console.error(`[engine] ${slug}/${action} error:`, error)
      return { data: null, error: error.message ?? 'Function error' }
    }

    return { data: data as T, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error(`[engine] ${slug}/${action} threw:`, message)
    return { data: null, error: message }
  }
}
