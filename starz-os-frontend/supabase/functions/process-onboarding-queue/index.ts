// supabase/functions/process-onboarding-queue/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

Deno.serve(async () => {
  try {
    // 1. Claim oldest queued job
    const { data: job, error: claimError } = await supabase
      .from("work_order_onboarding_queue")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (claimError) throw claimError

    if (!job) {
      return Response.json({
        ok: true,
        message: "No queued jobs"
      })
    }

    // 2. Mark processing
    await supabase
      .from("work_order_onboarding_queue")
      .update({
        status: "processing",
        attempts: (job.attempts || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id)

    // 3. Call Zara onboarding
    const res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/zara-onboarding`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify(job.payload || job)
      }
    )

    const text = await res.text()

    if (!res.ok) {
      await supabase
        .from("work_order_onboarding_queue")
        .update({
          status: "failed",
          last_error: text,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id)

      return Response.json({ ok: false, error: text })
    }

    // 4. Mark done
    await supabase
      .from("work_order_onboarding_queue")
      .update({
        status: "done",
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id)

    return Response.json({
      ok: true,
      processed: job.id
    })

  } catch (err) {
    return Response.json({
      ok: false,
      error: String(err)
    }, { status: 500 })
  }
})