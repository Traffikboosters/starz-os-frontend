import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sb(path: string, options: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function sbJson<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await sb(path, options);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`PostgREST ${res.status}: ${text || res.statusText}`);
  }

  if (!text) return null as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response from PostgREST: ${text}`);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function handleSteveLiveWhisper(_message: string, _context: any) {
  return `Steve Live Tip: Emphasize ROI + urgency.`;
}

function detectObjection(text: string) {
  const t = String(text || "").toLowerCase();
  if (t.includes("price") || t.includes("expensive")) return "price";
  if (t.includes("not interested")) return "interest";
  if (t.includes("send info")) return "stall";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const body = await req.json();
    const action = body?.action;

    if (action === "vox_live_tick") {
      const { tenant_id } = body;
      if (!tenant_id) {
        return json({ ok: false, error: "tenant_id required" }, 400);
      }

      const queue = await sbJson<any[]>(
        `communications.vox_messages?tenant_id=eq.${encodeURIComponent(
          tenant_id,
        )}&target=eq.steve&status=eq.queued&limit=20&order=created_at.asc`,
      );

      for (const item of queue ?? []) {
        const message = item?.message ?? "";
        const context = item?.context ?? {};

        let whisper = await handleSteveLiveWhisper(message, context);
        const objection = detectObjection(message);

        if (objection) {
          whisper += `\n🔥 OBJECTION: ${objection.toUpperCase()}`;
        }

        await sbJson(`communications.vox_messages?id=eq.${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            response: whisper,
            status: "completed",
            event_type: "live_call_whisper",
          }),
        });

        await sbJson("ai.learning_log", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            agent: "steve_live",
            input: message,
            objection_type: objection,
            deal_id: context?.deal_id || null,
          }),
        });
      }

      return json({ ok: true, processed: (queue ?? []).length });
    }

    return json({ ok: true, message: "outreach-engine running" });
  } catch (err: any) {
    console.error("outreach-engine error:", err);
    return json({ ok: false, error: err?.message || "Unhandled error" }, 500);
  }
});