import { NextRequest, NextResponse } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"

const EXPORT_ALLOWED_ROLES = new Set(["admin", "manager"] as const)
const EXPORT_PATH = "/api/export/leads"
const EXPORT_FILENAME = "leads.csv"
const MAX_EXPORT_ROWS = 10000 // safety cap; tune as needed

function normalizeRole(role?: string | null): string {
  return String(role ?? "").trim().toLowerCase()
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? "")
  // Escape quotes and wrap in quotes if needed
  const escaped = s.replace(/"/g, `""`)
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

function convertToCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ""

  const headers = Object.keys(rows[0])
  const headerLine = headers.map(escapeCsvCell).join(",")

  const body = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(",")
  )

  return [headerLine, ...body].join("\n")
}

async function logBlockedExportAttempt(
  supabase: ReturnType<typeof createServerClient>,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.rpc("log_access_event", {
      p_event_type: "blocked_lead_export_attempt",
      p_resource_schema: "crm",
      p_resource_table: "leads",
      p_severity: "critical",
      p_metadata: {
        path: EXPORT_PATH,
        ts: Date.now(),
        ...metadata,
      },
    })
  } catch (e) {
    // Never weaken enforcement because logging failed
    console.error("SECURITY LOG FAILED", e)
  }
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Server misconfiguration", 500)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      // Required for type-completeness; route currently read-only
      set(_name: string, _value: string, _options: CookieOptions) {},
      remove(_name: string, _options: CookieOptions) {},
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError("Unauthorized", 401)
  }

  const role = normalizeRole(user.app_metadata?.role as string | null)
  const allowed = EXPORT_ALLOWED_ROLES.has(role as (typeof EXPORT_ALLOWED_ROLES extends Set<infer T> ? T : never))

  if (!allowed) {
    await logBlockedExportAttempt(supabase, {
      user_id: user.id,
      role,
      method: req.method,
    })
    return jsonError("Export not permitted", 403)
  }

  // Pull only what you need; avoid unbounded export
  const { data, error } = await supabase
    .from("secure_lead_export_v")
    .select("*")
    .limit(MAX_EXPORT_ROWS)

  if (error) {
    console.error("EXPORT QUERY FAILED", error)
    return jsonError("Failed to fetch leads", 500)
  }

  const csv = convertToCSV((data ?? []) as Record<string, unknown>[])
  const filename = data && data.length >= MAX_EXPORT_ROWS
    ? `${EXPORT_FILENAME.replace(".csv", "")}_capped_${MAX_EXPORT_ROWS}.csv`
    : EXPORT_FILENAME

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}