import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

type Json = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chooseChannels(intent: string, attempts: number): string[] {
  const normalized = intent.toLowerCase();
  if (normalized === "hot") return ["call", "sms"];
  if (normalized === "buying" || normalized === "warm") return ["email", "sms"];
  if (attempts >= 3) return ["sms", "call"];
  return ["email"];
}

async function invokeFirst(functionNames: string[], payload: Json) {
  for (const fn of functionNames) {
    const { data, error } = await supabase.functions.invoke(fn, { body: payload });
    if (!error) return { ok: true, function: fn, data };
  }
  return { ok: false, functions: functionNames };
}

async function beginRun(runKey: string, mode: "rebalance" | "rotate") {
  const { data, error } = await supabase.rpc("begin_run", {
    p_run_key: runKey,
    p_mode: mode,
  });
  if (error) throw error;
  return data as { status?: string } | null;
}

async function finishRun(
  runKey: string,
  status: "done" | "failed",
  notes: Json = {},
) {
  const { error } = await supabase.rpc("finish_run", {
    p_run_key: runKey,
    p_status: status,
    p_notes: notes,
  });
  if (error) console.error("finish_run error", error);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const mode = body.mode ?? "outreach";

  // OUTREACH (existing behavior)
  if (mode === "outreach") {
    const leadId = body.lead_id;
    if (!leadId) return json({ error: "lead_id is required" }, 400);

    const intent = (body.intent ?? "warm").toLowerCase();
    const message = body.message ?? "";

    const { count, error: attemptsError } = await supabase
      .from("ai.lead_memory")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId);

    if (attemptsError) {
      return json({ ok: false, mode, error: attemptsError.message }, 500);
    }

    const attempts = count ?? 0;
    const channels = chooseChannels(intent, attempts);
    const results: Json[] = [];

    for (const ch of channels) {
      if (ch === "email") {
        results.push(
          await invokeFirst(["send-email", "send_email"], {
            lead_id: leadId,
            message,
            source: "steve-orchestrator",
          }),
        );
      }

      if (ch === "sms") {
        results.push(
          await invokeFirst(["send-sms", "steve_sms_engine"], {
            lead_id: leadId,
            message,
            source: "steve-orchestrator",
          }),
        );
      }

      if (ch === "call") {
        results.push(
          await invokeFirst(["voice-call", "steve_call_now"], {
            lead_id: leadId,
            source: "steve-orchestrator",
          }),
        );
      }
    }

    return json({ ok: true, mode, lead_id: leadId, channels, results });
  }

  if (mode === "rebalance") {
    const runKey: string = body.run_key ?? crypto.randomUUID();
    try {
      const run = await beginRun(runKey, "rebalance");
      if (run?.status === "done") {
        return json({ ok: true, mode, run_key: runKey, skipped: true });
      }

      const { data, error } = await supabase.rpc("rebalance_pipelines", {
        p_target: 70,
        p_batch: 200,
      });
      if (error) throw error;

      await finishRun(runKey, "done", { result: data ?? {} });
      return json({ ok: true, mode, run_key: runKey, result: data });
    } catch (e) {
      const err = String(e);
      await finishRun(runKey, "failed", { error: err });
      return json({ ok: false, mode, run_key: runKey, error: err }, 500);
    }
  }

  if (mode === "rotate") {
    const runKey: string = body.run_key ?? crypto.randomUUID();
    try {
      const run = await beginRun(runKey, "rotate");
      if (run?.status === "done") {
        return json({ ok: true, mode, run_key: runKey, skipped: true });
      }

      const { data, error } = await supabase.rpc("rotate_stale_leads", {
        p_limit: 500,
      });
      if (error) throw error;

      await finishRun(runKey, "done", { rotated: data ?? 0 });
      return json({ ok: true, mode, run_key: runKey, rotated: data });
    } catch (e) {
      const err = String(e);
      await finishRun(runKey, "failed", { error: err });
      return json({ ok: false, mode, run_key: runKey, error: err }, 500);
    }
  }

  return json({ error: "Invalid mode" }, 400);
});