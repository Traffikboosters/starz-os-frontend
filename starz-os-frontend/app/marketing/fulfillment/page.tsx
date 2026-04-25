import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// optional but recommended if you generate DB types:
// import type { Database } from "@/types/database.types"
// const supabase = createClient<Database>(...)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Status = "pending" | "in_progress" | "completed" | "blocked" | "paused" | "cancelled"
type ServiceModule = "seo" | "backlinks" | "content" | "smm" | "competitor" | "authority"

const STATUS_SET = new Set<Status>([
  "pending",
  "in_progress",
  "completed",
  "blocked",
  "paused",
  "cancelled",
])

function isStatus(value: string): value is Status {
  return STATUS_SET.has(value as Status)
}

type EnginePayload = {
  action: string
  work_order_id: string
  module?: ServiceModule | null
  org_id: string
  source: string
  actor: string
  options?: Record<string, unknown>
}

type AssignPayload = {
  work_order_id: string
  assignee_user_id: string
  org_id: string
  source: string
  actor: string
}

type FulfillmentPayload = {
  action: "set_status"
  work_order_id: string
  status: Status
  org_id: string
  source: string
  actor: string
}

type InvokeResult<T = unknown> = {
  data: T | null
  error: string | null
}
async function invokeFunction<T = unknown>(
  client: SupabaseClient,
  functionName: string,
  payload: EnginePayload | AssignPayload | FulfillmentPayload
): Promise<InvokeResult<T>> {
  const { data, error } = await client.functions.invoke(functionName, { body: payload })
  if (error) return { data: null, error: error.message || `Failed invoking ${functionName}` }
  return { data: (data as T) ?? null, error: null }
}
const workOrdersQuery = supabase
  .from(CONFIG.views.workOrders)
  .select(`...`)
  .eq("org_id", orgId)
  .order("created_at", { ascending: false })
  .limit(100)

const jobsQuery = supabase
  .from(CONFIG.views.jobs)
  .select(`...`)
  .eq("org_id", orgId)
  .order("created_at", { ascending: false })
  .limit(500)

const activityQuery = supabase
  .from(CONFIG.views.activity)
  .select(`...`)
  .eq("org_id", orgId)
  .order("created_at", { ascending: false })
  .limit(500)
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : "Failed to load fulfillment data."
  setError(message)
}
function Badge({ children }: { children: ReactNode }) { ... }
function ActionButton({ children, ... }: { children: ReactNode; ... }) { ... }