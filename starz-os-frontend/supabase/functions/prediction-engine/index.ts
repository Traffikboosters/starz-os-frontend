import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function predictClose(score: number) {
  if (score > 80) return 0.9;
  if (score > 60) return 0.7;
  if (score > 40) return 0.5;
  return 0.2;
}

function predictFulfillment(authority: number) {
  if (authority > 60) return "Scaling";
  if (authority > 40) return "Growing";
  return "Early Stage";
}

Deno.serve(async (req) => {

  const { work_order_id } = await req.json();

  const { data: wo } = await supabase
    .schema("fulfillment")
    .from("work_orders")
    .select("*")
    .eq("id", work_order_id)
    .single();

  const { data: authority } = await supabase
    .schema("analytics")
    .from("authority_snapshots")
    .select("authority_score")
    .eq("work_order_id", work_order_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const prediction = {
    close_probability: predictClose(wo?.score || 50),
    fulfillment_stage: predictFulfillment(authority?.authority_score || 0)
  };

  await supabase.schema("analytics").from("predictions").insert({
    work_order_id,
    ...prediction
  });

  return new Response(JSON.stringify(prediction));
});