import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const { work_order_id } = await req.json();

  const { data: authority } = await supabase
    .schema("analytics")
    .from("authority_snapshots")
    .select("*")
    .eq("work_order_id", work_order_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: backlinks } = await supabase
    .schema("marketing")
    .from("backlinks")
    .select("*")
    .eq("work_order_id", work_order_id);

  const report = {
    authority_score: authority?.authority_score,
    backlinks: backlinks?.length
  };

  return new Response(JSON.stringify(report));
});