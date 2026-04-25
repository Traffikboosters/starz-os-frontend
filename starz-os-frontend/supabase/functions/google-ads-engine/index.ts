import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GOOGLE_ADS_TOKEN = Deno.env.get("GOOGLE_ADS_TOKEN");

async function log(work_order_id: string, org_id: string, msg: string) {
  await supabase.schema("fulfillment").from("activity_log").insert({
    work_order_id,
    org_id,
    event_type: "google_ads",
    title: "📣 Google Ads",
    message: msg
  });
}

Deno.serve(async (req) => {
  const { work_order_id } = await req.json();

  const { data: keywords } = await supabase
    .schema("marketing")
    .from("keyword_targets")
    .select("keyword, priority_score")
    .eq("work_order_id", work_order_id)
    .order("priority_score", { ascending: false })
    .limit(20);

  if (!keywords) throw new Error("No keywords");

  // Simulated campaign creation (replace with real Google Ads API)
  const campaign = {
    name: `STARZ Campaign ${Date.now()}`,
    budget: 50,
    keywords
  };

  await supabase.schema("marketing").from("ads_campaigns").insert({
    work_order_id,
    name: campaign.name,
    daily_budget: 50,
    status: "active"
  });

  const { data: wo } = await supabase
    .schema("fulfillment")
    .from("work_orders")
    .select("org_id")
    .eq("id", work_order_id)
    .single();

  await log(work_order_id, wo!.org_id, "Campaign launched with keywords");

  return new Response(JSON.stringify({ success: true }));
});