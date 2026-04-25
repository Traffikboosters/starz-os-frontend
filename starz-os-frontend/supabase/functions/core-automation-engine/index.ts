import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    // ===============================
    // LEAD DISTRIBUTION (REFILL TO 70)
    // ===============================
    if (action === "lead_distribution") {
      const { data: contractors } = await supabase
        .from("crm.contractors")
        .select("id, performance_score")
        .eq("active", true);

      for (const contractor of contractors || []) {
        const { count } = await supabase
          .from("crm.leads")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", contractor.id);

        const deficit = 70 - (count || 0);
        if (deficit <= 0) continue;

        // Qualified leads
        const { data: qualified } = await supabase
          .from("crm.leads")
          .select("*")
          .is("owner_id", null)
          .gte("score", 60)
          .limit(deficit);

        let remaining = deficit - (qualified?.length || 0);

        let warm: any[] = [];
        if (remaining > 0) {
          const res = await supabase
            .from("crm.leads")
            .select("*")
            .is("owner_id", null)
            .gte("score", 40)
            .lt("score", 60)
            .limit(remaining);

          warm = res.data || [];
        }

        const leadsToAssign = [...(qualified || []), ...warm];

        for (const lead of leadsToAssign) {
          await supabase
            .from("crm.leads")
            .update({
              owner_id: contractor.id,
              owner_type: "contractor",
              assigned_at: new Date().toISOString(),
            })
            .eq("id", lead.id);

          await supabase.from("crm.lead_assignments").insert({
            lead_id: lead.id,
            assigned_to: contractor.id,
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: corsHeaders,
      });
    }

    // ===============================
    // LEAD ROTATION (3 DAY RULE)
    // ===============================
    if (action === "lead_rotation") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 3);

      const { data: staleLeads } = await supabase
        .from("crm.leads")
        .select("*")
        .lt("last_activity_at", cutoff.toISOString())
        .not("owner_id", "is", null);

      for (const lead of staleLeads || []) {
        await supabase
          .from("crm.leads")
          .update({
            owner_id: null,
            owner_type: null,
            recycled: true,
          })
          .eq("id", lead.id);

        await supabase.from("crm.lead_assignments").insert({
          lead_id: lead.id,
          removed_at: new Date().toISOString(),
          reason: "3_day_inactive",
        });
      }

      return new Response(
        JSON.stringify({ rotated: staleLeads?.length || 0 }),
        { headers: corsHeaders }
      );
    }

    // ===============================
    // LEAD ENGAGEMENT
    // ===============================
    if (action === "lead_engagement") {
      const { lead_id, user_id, action_type } = body;

      await supabase.from("crm.engagement_logs").insert({
        lead_id,
        user_id,
        action_type,
      });

      await supabase
        .from("crm.leads")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", lead_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});