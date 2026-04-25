"use client"

import { createClient } from "@/lib/supabase/client"

// 🔐 ROLE DEFINITIONS
export const restrictedRoles = ["bge_rep", "bge_contractor"] as const
export const exportAllowedRoles = ["admin", "manager"] as const

export type AppRole =
  | (typeof restrictedRoles)[number]
  | (typeof exportAllowedRoles)[number]
  | string

// 🧠 SAFE ROLE RESOLUTION (Supabase Auth ONLY)
export async function getCurrentUserRole(): Promise<AppRole | null> {
  const supabase = createClient()

  const {
    data: { user },
    error
  } = await supabase.auth.getUser()

  if (error || !user) return null

  return (user.app_metadata?.role as AppRole | undefined) ?? null
}

// ✅ PERMISSION CHECK
export function canExportLeads(role?: AppRole | null) {
  if (!role) return false
  return exportAllowedRoles.includes(
    role as (typeof exportAllowedRoles)[number]
  )
}

// 🚫 RESTRICTED ROLE CHECK
export function isRestrictedLeadRole(role?: AppRole | null) {
  if (!role) return false
  return restrictedRoles.includes(
    role as (typeof restrictedRoles)[number]
  )
}

// 🚨 FAIL-CLOSED BLOCK (LOG + STOP)
export async function blockLeadExport(path?: string) {
  const supabase = createClient()

  try {
    await supabase.rpc("log_access_event", {
      p_event_type: "blocked_lead_export_attempt",
      p_resource_schema: "crm",
      p_resource_table: "leads",
      p_severity: "critical",
      p_metadata: {
        path:
          path ??
          (typeof window !== "undefined"
            ? window.location.pathname
            : null),
        ts: Date.now()
      }
    })
  } catch (e) {
    console.error("SECURITY LOG FAILED", e)
    // still block — NEVER fail open
  }

  throw new Error("Lead export is not permitted for your role.")
}

// 🔐 ENFORCED EXPORT GUARD (ONLY ENTRY POINT)
export async function withLeadExportGuard<T>(
  fn: () => Promise<T>
): Promise<T> {
  const role = await getCurrentUserRole()

  if (!canExportLeads(role)) {
    await blockLeadExport()
  }

  return fn()
}