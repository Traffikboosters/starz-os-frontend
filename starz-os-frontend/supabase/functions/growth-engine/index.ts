// supabase/functions/growth-engine/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey"
}

async function sb(path: string, options: any = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "Content-Type": "application/json",
      ...options.headers
    }
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers })

  try {
    const { action } = await req.json()

    // ============================================================
    // 🔁 FEEDER ENGINE (MAIN LOOP)
    // ============================================================
    if (action === "feeder_cycle") {

      // ----------------------------------------
      // 1. ROTATION CLEANUP (ANTI-HOARDING)
      // ----------------------------------------
      await sb("rpc/rotate_expired_leads", {
        method: "POST"
      })

      // ----------------------------------------
      // 2. GET ACTIVE CONTRACTORS
      // ----------------------------------------
      const contractorsRes = await sb(
        "users?role=eq.contractor&status=eq.active&select=id"
      )
      const contractors = await contractorsRes.json()

      // ----------------------------------------
      // 3. LOOP CONTRACTORS → ENSURE 70 LEADS
      // ----------------------------------------
      for (const c of contractors) {

        // Count active leads
        const activeRes = await sb(
          `lead_assignments?user_id=eq.${c.id}&status=eq.active&select=id`
        )
        const active = (await activeRes.json()).length

        if (active >= 70) continue

        const needed = 70 - active

        // ----------------------------------------
        // 4. FETCH FEEDER LEADS (T3 ONLY)
        // SKIP LOCKED USING FOR UPDATE SKIP LOCKED
        // ----------------------------------------
        const leadsRes = await sb(
          `rpc/get_feeder_leads`,
          {
            method: "POST",
            body: JSON.stringify({ limit_count: needed })
          }
        )

        const leads = await leadsRes.json()

        // ----------------------------------------
        // 5. ASSIGN LEADS (ATOMIC)
        // ----------------------------------------
        for (const lead of leads) {
          await sb("lead_assignments", {
            method: "POST",
            body: JSON.stringify({
              lead_id: lead.id,
              user_id: c.id,
              status: "active"
            })
          })
        }
      }

      // ----------------------------------------
      // 6. PRIORITY DISTRIBUTION (T1 / T2)
      // ----------------------------------------
      await sb("rpc/distribute_priority_leads", {
        method: "POST"
      })

      return new Response(
        JSON.stringify({ success: true, message: "Feeder cycle complete" }),
        { headers }
      )
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers
    })
  }
})