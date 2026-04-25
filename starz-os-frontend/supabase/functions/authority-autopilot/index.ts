import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function log(work_order_id: string, org_id: string, title: string, message: string) {
  await supabase.schema("fulfillment").from("activity_log").insert({
    work_order_id,
    org_id,
    event_type: "authority_autopilot",
    title,
    message,
  });
}

async function callEngine(name: string, payload: any) {
  const { error } = await supabase.functions.invoke(name, { body: payload });
  if (error) throw new Error(`${name} failed`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { work_order_id } = await req.json();

    if (!work_order_id) {
      return json({ error: "Missing work_order_id" }, 400);
    }

    // Get latest authority snapshot
    const { data: snapshot } = await supabase
      .schema("analytics")
      .from("authority_snapshots")
      .select("*")
      .eq("work_order_id", work_order_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!snapshot) {
      return json({ message: "No authority data yet" });
    }

    const {
      authority_score,
      referring_domains,
      live_backlinks,
      keyword_targets
    } = snapshot;

    const { data: wo } = await supabase
      .schema("fulfillment")
      .from("work_orders")
      .select("org_id")
      .eq("id", work_order_id)
      .single();

    if (!wo) return json({ error: "Work order not found" });

    let actions: string[] = [];

    // =============================
    // DECISION LOGIC
    // =============================

    if (referring_domains < 30) {
      await callEngine("backlink-engine", { work_order_id });
      actions.push("backlinks_boost");
    }

    if (live_backlinks < 20) {
      await callEngine("backlink-outreach", { work_order_id });
      actions.push("outreach_boost");
    }

    if (keyword_targets < 25) {
      await callEngine("seo-unified-engine", { work_order_id });
      actions.push("seo_expand");
    }

    if (authority_score < 40) {
      await callEngine("content-ai", { work_order_id });
      actions.push("content_push");
    }

    // If strong → optimize instead of brute force
    if (authority_score >= 60) {
      await callEngine("competitor-engine", { work_order_id });
      actions.push("competitive_scaling");
    }

    // =============================
    // LOG RESULT
    // =============================

    await log(
      work_order_id,
      wo.org_id,
      "🤖 Authority Autopilot",
      `Actions triggered: ${actions.join(", ")}`
    );

    return json({
      success: true,
      authority_score,
      actions
    });

  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});