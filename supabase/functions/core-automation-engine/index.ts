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

async function handleSteve(_message: string, _context: any) {
  return `Steve: Focus on urgency + ROI.`;
}
async function handleRico(_message: string, _context: any) {
  return `Rico: Delivery is solid, reinforce trust.`;
}
async function handleZara(_message: string, _context: any) {
  return `Zara: Follow policy guidelines.`;
}

async function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), ms)),
  ]);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const body = await req.json();
    const action = body?.action;

    const user = {
      id: body?.user_id || "test-user",
      role: body?.user_role || "bge_contractor",
      tenant_id: body?.tenant_id || "test-tenant",
    };

    if (action === "vox_message") {
      const { message, target, context: inputContext = {}, call_id = null } = body;

      if (!message || !target) {
        return json({ ok: false, error: "Missing message/target" }, 400);
      }

      if (!["steve", "rico", "zara"].includes(target)) {
        return json({ ok: false, error: "Invalid target" }, 400);
      }

      // mutable context copy
      const context = { ...inputContext };

      const tenantId = context.tenant_id ?? user.tenant_id;
      const userRole = context.user_role ?? user.role;

      const allowedEvents = [
        "user_message",
        "live_call_line",
        "live_call_whisper",
        "system_action",
      ];

      const eventType = context.event_type || "user_message";
      if (!allowedEvents.includes(eventType)) {
        return json({ ok: false, error: "Invalid event_type" }, 400);
      }

      if (userRole === "bge_contractor") {
        context.hide_internal_logic = true;
        context.max_discount = 0.2;
      }

      const priority = call_id
        ? 100
        : context?.deal_value > 5000
        ? 80
        : context?.lead_score > 70
        ? 60
        : 10;

      const inserted = await sbJson<any[]>("communications.vox_messages", {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          user_id: user.id,
          role: userRole,
          target,
          message,
          context,
          source: call_id ? "powerdial" : "ui",
          event_type: call_id ? "live_call_line" : eventType,
          status: "queued",
          call_id,
          priority,
        }),
      });

      const msgRow = inserted?.[0];
      if (!msgRow?.id) {
        throw new Error("Insert succeeded but no vox_messages row returned");
      }

      let aiResponse = "";
      try {
        if (target === "steve") aiResponse = await withTimeout(handleSteve(message, context));
        if (target === "rico") aiResponse = await withTimeout(handleRico(message, context));
        if (target === "zara") aiResponse = await withTimeout(handleZara(message, context));
      } catch {
        aiResponse = "⚠️ Focus on urgency + value. Keep the conversation moving.";
      }

      await sbJson(
        `communications.vox_messages?id=eq.${encodeURIComponent(msgRow.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            response: aiResponse,
            status: "completed",
          }),
        },
      );

      const text = String(message).toLowerCase();

      let intent: "close" | "pricing" | null = null;
      if (text.includes("yes") || text.includes("interested")) intent = "close";
      else if (text.includes("price")) intent = "pricing";

      async function triggerIdempotent(type: string, refId: string | null | undefined, actionName: string) {
        if (!refId) return;

        const key = `${type}:${refId}`;

        // NOTE: best protection is a DB unique constraint on automation.idempotency_keys.key
        const exists = await sbJson<any[]>(
          `automation.idempotency_keys?key=eq.${encodeURIComponent(key)}&select=key&limit=1`,
          { method: "GET" },
        );

        if (!exists?.length) {
          try {
            await sbJson("automation.idempotency_keys", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ key, action: actionName }),
            });
            console.log(`Trigger action: ${actionName}`);
          } catch (e) {
            console.warn(`Idempotency insert skipped/failed for key ${key}:`, e);
          }
        }
      }

      if (intent === "close") {
        await triggerIdempotent("proposal", context.lead_id, "generate_proposal");
      }
      if (intent === "pricing") {
        await triggerIdempotent("pricing", context.deal_id, "dynamic_pricing");
      }

      await sbJson("ai.learning_log", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          agent: target,
          input: message,
          intent,
          deal_id: context?.deal_id || null,
        }),
      });

      return json({ ok: true, id: msgRow.id, response: aiResponse });
    }

    return json({ ok: true, message: "core-automation-engine running" });
  } catch (err: any) {
    console.error("core-automation-engine error:", err);
    return json({ ok: false, error: err?.message || "Unhandled error" }, 500);
  }
});