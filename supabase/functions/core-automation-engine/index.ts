const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const INTERNAL_TOKEN = Deno.env.get("INTERNAL_AUTOMATION_SECRET") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@traffikboosters.com";

const H: Record<string,string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token, resend-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: H });
}

async function query(path: string, opts: RequestInit = {}, schema?: string) {
  const extraH: Record<string,string> = {};
  if (schema) { extraH["Accept-Profile"] = schema; extraH["Content-Profile"] = schema; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE, "Content-Type": "application/json", ...extraH, ...(opts.headers||{}) },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function rpc(fn: string, params: Record<string,unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const tenantId = String(body?.tenant_id ?? "11111111-1111-1111-1111-111111111111");
    const payload = (body?.payload ?? {}) as Record<string,unknown>;

    // HEALTH
    if (!action || action === "health") {
      return ok({ ok: true, message: "core-automation-engine running" });
    }

    // VOX MESSAGE - Steve/Rico/Zara AI chat
    if (action === "vox_message") {
      const message = String(body?.message ?? "");
      const target = String(body?.target ?? "");
      if (!message || !target) return ok({ ok: false, error: "Missing message/target" }, 400);
      if (!["steve","rico","zara"].includes(target)) return ok({ ok: false, error: "Invalid target" }, 400);

      let aiResponse = "";
      if (target === "steve") {
        let patternHint = "";
        try {
          const mem = await query("steve_memory?select=patterns&id=eq.global&limit=1", { method: "GET" }, "ai");
          if (Array.isArray(mem) && mem[0]?.patterns?.length > 0) {
            patternHint = ` Top pattern: ${JSON.stringify(mem[0].patterns[0]).slice(0,200)}`;
          }
        } catch(_e) {}
        aiResponse = `Steve: Focus on urgency + ROI. ${patternHint}`;
      } else if (target === "rico") {
        aiResponse = "Rico: Delivery is solid. Reinforce trust and keep the project on track.";
      } else if (target === "zara") {
        aiResponse = "Zara: Follow policy guidelines. Ensure compliance and team alignment.";
      }

      // Log to learning — non-fatal
      await query("learning_log", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ agent: target, input: message, deal_id: (payload?.deal_id as string) || null }),
      }, "ai").catch(() => {});

      return ok({ ok: true, response: aiResponse });
    }

    // TRAIN STEVE
    if (action === "train_steve") {
      let patterns: unknown[] = [];
      try {
        patterns = await query("v_steve_patterns?select=*&order=win_rate.desc&limit=50", { method: "GET" }, "ai") ?? [];
      } catch(_e) {}
      await query("steve_memory?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: "global", patterns, updated_at: new Date().toISOString() }),
      }, "ai").catch(() => {});
      return ok({ ok: true, patterns_loaded: patterns.length });
    }

    // LEAD DISTRIBUTION
    if (action === "lead_distribution") {
      const result = await rpc("assign_lead_atomic", { p_tenant_id: tenantId, ...payload })
        .catch(() => rpc("dispense_leads", { tenant_id: tenantId }).catch((e: Error) => ({ error: e.message })));
      return ok({ ok: true, result, message: "Lead distribution complete" });
    }

    // LEAD ROTATION
    if (action === "lead_rotation") {
      const result = await rpc("rotate_stale_leads", { p_tenant_id: tenantId }).catch((e: Error) => ({ error: e.message }));
      return ok({ ok: true, result });
    }

    // SENTINEL SCAN
    if (action === "sentinel_scan") {
      const result = await rpc("run_sentinel_scan", { p_tenant_id: tenantId }).catch((e: Error) => ({ error: e.message }));
      return ok({ ok: true, result });
    }

    // DECISION ENGINE
    if (action === "decision_engine") {
      const result = await rpc("run_decision_engine", { p_tenant_id: tenantId, ...payload }).catch((e: Error) => ({ error: e.message }));
      return ok({ ok: true, result });
    }

    // PRIORITY DISPATCH
    if (action === "priority_dispatch") {
      const result = await rpc("dispatch_priority_leads", { p_tenant_id: tenantId }).catch((e: Error) => ({ error: e.message }));
      return ok({ ok: true, result });
    }

    // COMPUTE RISK
    if (action === "compute_risk") {
      const result = await rpc("compute_deal_risk", { p_tenant_id: tenantId, ...payload }).catch((e: Error) => ({ error: e.message }));
      return ok({ ok: true, result });
    }

    // REASSIGN STALE
    if (action === "reassign_stale") {
      const result = await rpc("reassign_stale_leads", { p_tenant_id: tenantId }).catch((e: Error) => ({ error: e.message }));
      return ok({ ok: true, result, message: "Stale leads reassigned" });
    }

    // REQUALIFY LEAD
    if (action === "requalify_lead") {
      const leadId = String(payload?.lead_id ?? "");
      if (leadId) {
        await query(`leads?id=eq.${leadId}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "requalifying", last_activity_at: new Date().toISOString() }),
        }, "crm").catch(() => {});
      }
      return ok({ ok: true, message: "Lead sent to Steve for requalification" });
    }

    // INVITE USER
    if (action === "invite_user") {
      const { email, role_key } = payload;
      await query("user_invites", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ email, role_key, status: "pending", invited_at: new Date().toISOString() }),
      }, "hr").catch(() => {});
      if (RESEND_API_KEY && email) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `Zara | Traffik Boosters <${FROM_EMAIL}>`, to: [email], subject: "You're invited to Traffik Boosters BGE Portal", html: `<p>Hi,</p><p>You've been invited to join as a ${role_key||"BGE Contractor"}. Click the link to accept.</p><p>— Zara, HR Director</p>` }),
        }).catch(() => {});
      }
      return ok({ ok: true, message: `Invite sent to ${email}` });
    }

    // TRIGGER ZARA ONBOARDING
    if (action === "trigger_zara_onboarding" || action === "onboard_contractor") {
      const { email, role_key, name, starter_leads } = payload;
      await query("onboarding_log", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ email, full_name: name||email, role_key: role_key||"bge_contractor", status: "pending", sent_at: new Date().toISOString() }),
      }, "hr").catch(() => {});
      if (RESEND_API_KEY && email) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `Zara | Traffik Boosters <${FROM_EMAIL}>`, to: [email], subject: "Welcome to Traffik Boosters — BGE Onboarding", html: `<p>Hi ${name||"there"},</p><p>Welcome aboard! Your onboarding has been initiated. You will receive leads and training shortly.</p><p>— Zara, HR Director</p>` }),
        }).catch(() => {});
      }
      return ok({ ok: true, message: `Onboarding triggered for ${email}` });
    }

    // CREATE TASK
    if (action === "create_task") {
      const { user_id, title, priority, category } = payload;
      await query("onboarding_log", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id, full_name: title, role_key: category||"task", status: "pending", sent_at: new Date().toISOString() }),
      }, "hr").catch(() => {});
      return ok({ ok: true, message: `Task created: ${title}` });
    }

    // RESOLVE HR ALERT
    if (action === "resolve_hr_alert") {
      const alertId = String(payload?.alert_id ?? "");
      await query(`alerts?id=eq.${alertId}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString() }),
      }, "hr").catch(() => {});
      return ok({ ok: true, message: "Alert resolved" });
    }

    // GENERATE HR REPORT
    if (action === "generate_hr_report") {
      const result = await rpc("generate_hr_summary", { p_tenant_id: tenantId }).catch(() => null);
      return ok({ ok: true, message: "HR report generated", result });
    }

    // FLAG COACHING
    if (action === "flag_coaching") {
      const result = await rpc("flag_low_performers", { p_daily_target: payload.daily_target||30, p_min_conversion: payload.min_conversion||8 }).catch(() => null);
      return ok({ ok: true, message: "Low performers flagged", result });
    }

    // AUTO RECRUIT
    if (action === "auto_recruit") {
      const result = await rpc("trigger_auto_recruit", { p_tenant_id: tenantId, p_threshold: payload.threshold||15 }).catch(() => null);
      return ok({ ok: true, message: "Auto recruit triggered", result });
    }

    // PLACE CALL (proxy to dialpad-call)
    if (action === "place_call") {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/dialpad-call`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "call", phone: payload.phone_number, queue_id: payload.queue_id, tenant_id: tenantId }),
      });
      const data = await res.json().catch(() => ({}));
      return ok({ ok: true, ...data });
    }

    // PAYMENT RECEIVED
    if (action === "payment_received") {
      const token = req.headers.get("x-internal-token") ?? "";
      if (token !== INTERNAL_TOKEN) return ok({ ok: false, error: "Unauthorized" }, 403);
      const { proposal_id, deal_id = null, amount, stripe_event_id = null, stripe_session_id = null, invoice_id = null } = payload;
      if (!proposal_id) return ok({ ok: false, error: "Missing proposal_id" }, 400);
      const parsedAmount = typeof amount === "number" ? amount : Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return ok({ ok: false, error: "Invalid amount" }, 400);
      const stableId = stripe_event_id ?? invoice_id ?? stripe_session_id ?? proposal_id;
      await query("learning_log?on_conflict=event_key", {
        method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify([{ event: "payment_received", event_key: `payment_received:${stableId}`, deal_id, revenue: parsedAmount, created_at: new Date().toISOString() }]),
      }, "ai").catch(() => {});
      return ok({ ok: true });
    }

    // PAYMENT FAILED
    if (action === "payment_failed") {
      const token = req.headers.get("x-internal-token") ?? "";
      if (token !== INTERNAL_TOKEN) return ok({ ok: false, error: "Unauthorized" }, 403);
      const { customer_id = null, stripe_event_id = null, invoice_id = null, stripe_session_id = null } = payload;
      const stableId = stripe_event_id ?? invoice_id ?? stripe_session_id ?? customer_id;
      if (!stableId) return ok({ ok: false, error: "Missing stable identifier" }, 400);
      await query("learning_log?on_conflict=event_key", {
        method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify([{ event: "payment_failed", event_key: `payment_failed:${stableId}`, customer_id, created_at: new Date().toISOString() }]),
      }, "ai").catch(() => {});
      return ok({ ok: true });
    }

    // Default
    return ok({ ok: true, message: "core-automation-engine running" });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unhandled error";
    console.error("core-automation-engine:", msg);
    return ok({ ok: false, error: msg }, 500);
  }
});