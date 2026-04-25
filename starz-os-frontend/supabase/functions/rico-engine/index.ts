// UPGRADED RICO ENGINE (MERGED)

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// =============================
// HELPERS
// =============================
async function logActivity(work_order_id: string, org_id: string, title: string, message: string) {
  await supabase.schema("fulfillment").from("activity_log").insert({
    work_order_id,
    org_id,
    event_type: "rico_engine",
    title,
    message
  });
}

async function createJob(work_order_id: string, org_id: string, module: string) {
  await supabase.schema("fulfillment").from("jobs").insert({
    work_order_id,
    org_id,
    engine_name: "rico-engine",
    module,
    status: "pending",
    step_name: "queued",
    progress_pct: 0
  });
}

async function callEngine(name: string, payload: any) {
  const { error } = await supabase.functions.invoke(name, { body: payload });
  if (error) throw new Error(`${name} failed: ${error.message}`);
}

// =============================
// TASK GENERATION (YOUR ORIGINAL)
// =============================
function getTasks(serviceType: string) {
  if (serviceType === "SEO") {
    return [
      { type: "keyword_research", role: "seo", instructions: "Find 50 keywords" },
      { type: "site_audit", role: "seo", instructions: "Run SEO audit" },
      { type: "content", role: "content", instructions: "Write 5 blogs" },
      { type: "backlinks", role: "seo", instructions: "Build backlinks" }
    ];
  }
  return [];
}

// =============================
// MAIN HANDLER
// =============================
Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  try {
    const body = await req.json();
    const { action, work_order_id, org_id, module } = body;

    if (!work_order_id) throw new Error("Missing work_order_id");

    // =============================
    // FETCH WORK ORDER
    // =============================
    const { data: wo } = await supabase
      .schema("fulfillment")
      .from("work_orders")
      .select("*")
      .eq("id", work_order_id)
      .single();

    if (!wo) throw new Error("Work order not found");

    // =============================
    // ACTION: START WORK ORDER
    // =============================
    if (action === "start_work_order") {

      await logActivity(work_order_id, org_id, "🚀 Start", "Rico started fulfillment");

      // 1. CREATE TASKS (YOUR LOGIC)
      const tasks = getTasks(wo.service_type);

      if (tasks.length > 0) {
        await supabase.schema("fulfillment").from("tasks").insert(
          tasks.map(t => ({
            work_order_id,
            task_type: t.type,
            assigned_role: t.role,
            instructions: t.instructions,
            status: "pending"
          }))
        );
      }

      // 2. CREATE JOBS + RUN ENGINES
      const modules = ["seo", "backlinks", "content", "smm", "competitor", "authority"];

      for (const m of modules) {
        await createJob(work_order_id, org_id, m);
      }

      await callEngine("seo-unified-engine", { work_order_id, org_id });
      await callEngine("backlink-engine", { work_order_id, org_id });
      await callEngine("content-ai", { work_order_id, org_id });
      await callEngine("smm-dispatcher", { work_order_id, org_id });
      await callEngine("competitor-engine", { work_order_id, org_id });
      await callEngine("authority-engine", { work_order_id, org_id });

      // UPDATE STATUS
      await supabase.schema("fulfillment").from("work_orders").update({
        status: "in_progress"
      }).eq("id", work_order_id);

      return new Response(JSON.stringify({ success: true }));
    }

    // =============================
    // ACTION: RUN SINGLE MODULE
    // =============================
    if (action === "run_module") {

      if (!module) throw new Error("Missing module");

      await logActivity(work_order_id, org_id, "⚙️ Module", `Running ${module}`);

      await createJob(work_order_id, org_id, module);

      const map: any = {
        seo: "seo-unified-engine",
        backlinks: "backlink-engine",
        content: "content-ai",
        smm: "smm-dispatcher",
        competitor: "competitor-engine",
        authority: "authority-engine"
      };

      await callEngine(map[module], { work_order_id, org_id });

      return new Response(JSON.stringify({ success: true }));
    }

    throw new Error("Invalid action");

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});