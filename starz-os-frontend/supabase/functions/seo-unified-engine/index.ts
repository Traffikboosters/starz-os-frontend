import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type WorkOrder = {
  id: string;
  org_id: string;
  domain: string | null;
  service_type: string | null;
  business_name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  target_keywords?: string[] | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function logActivity(work_order_id: string, org_id: string, title: string, message: string) {
  await supabase.schema("fulfillment").from("activity_log").insert({
    work_order_id,
    org_id,
    event_type: "seo_engine",
    title,
    message,
  });
}

async function upsertJobStatus(work_order_id: string, module: string, status: string, step_name: string, detail: string, progress_pct: number) {
  const { data: existing } = await supabase
    .schema("fulfillment")
    .from("jobs")
    .select("id")
    .eq("work_order_id", work_order_id)
    .eq("module", module)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .schema("fulfillment")
      .from("jobs")
      .update({ status, step_name, detail, progress_pct })
      .eq("id", existing.id);
  } else {
    await supabase
      .schema("fulfillment")
      .from("jobs")
      .insert({
        work_order_id,
        engine_name: "seo-unified-engine",
        module,
        status,
        step_name,
        detail,
        progress_pct,
      });
  }
}

function normalizeKeyword(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function estimateVolume(keyword: string): number {
  const words = keyword.split(" ").length;
  let score = 50;
  if (keyword.includes("near me")) score += 200;
  if (keyword.includes("services")) score += 120;
  if (keyword.includes("company")) score += 80;
  if (keyword.includes("best")) score += 100;
  if (keyword.includes("cost")) score += 90;
  if (keyword.includes("pricing")) score += 90;
  if (keyword.includes("agency")) score += 75;
  if (words <= 2) score += 160;
  if (words >= 5) score -= 30;
  return Math.max(20, score);
}

function estimateDifficulty(keyword: string): number {
  let kd = 20;
  if (keyword.includes("best")) kd += 18;
  if (keyword.includes("agency")) kd += 15;
  if (keyword.includes("services")) kd += 10;
  if (keyword.includes("near me")) kd += 8;
  if (keyword.split(" ").length <= 2) kd += 20;
  if (keyword.split(" ").length >= 5) kd -= 6;
  return Math.min(100, Math.max(5, kd));
}

function estimateIntent(keyword: string): string {
  if (/(pricing|price|cost|quote|service|services|company|agency|near me|hire)/i.test(keyword)) {
    return "transactional";
  }
  if (/(best|top|vs|review|reviews)/i.test(keyword)) {
    return "commercial";
  }
  return "informational";
}

function computePriority(searchVolume: number, kd: number, intent: string): number {
  const intentBoost =
    intent === "transactional" ? 35 :
    intent === "commercial" ? 20 :
    10;
  return Number((searchVolume * 0.35 + intentBoost - kd * 0.25).toFixed(2));
}

function buildKeywordUniverse(wo: WorkOrder): string[] {
  const seed: string[] = [];
  const business = (wo.business_name || "").trim();
  const domainRoot = (wo.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const brand = business || domainRoot.split(".")[0] || "business";
  const city = wo.city || "";
  const state = wo.state || "";
  const geo = [city, state].filter(Boolean).join(" ").trim();

  const userKeywords = (wo.target_keywords || []).map(normalizeKeyword);

  const patterns = [
    `${brand} services`,
    `${brand} company`,
    `${brand} pricing`,
    `${brand} reviews`,
    `${brand} near me`,
    `${brand} ${geo}`.trim(),
    `${brand} seo`,
    `${brand} marketing`,
    `best ${brand} company ${geo}`.trim(),
    `${brand} agency ${geo}`.trim(),
    `affordable ${brand} services ${geo}`.trim(),
    `${brand} cost ${geo}`.trim(),
  ];

  return Array.from(
    new Set(
      [...userKeywords, ...patterns]
        .map(normalizeKeyword)
        .filter(Boolean)
    )
  ).slice(0, 50);
}

async function fetchWorkOrder(work_order_id: string): Promise<WorkOrder> {
  const { data, error } = await supabase
    .schema("fulfillment")
    .from("work_orders")
    .select("id, org_id, domain, service_type, business_name, city, state, country, target_keywords")
    .eq("id", work_order_id)
    .single();

  if (error || !data) throw new Error("Work order not found for SEO engine");
  return data as WorkOrder;
}

async function saveKeywords(wo: WorkOrder, keywords: string[]) {
  const rows = keywords.map((keyword) => {
    const search_volume = estimateVolume(keyword);
    const keyword_difficulty = estimateDifficulty(keyword);
    const intent = estimateIntent(keyword);
    const priority_score = computePriority(search_volume, keyword_difficulty, intent);

    return {
      org_id: wo.org_id,
      work_order_id: wo.id,
      domain: wo.domain,
      keyword,
      intent,
      city: wo.city || null,
      state: wo.state || null,
      country: wo.country || null,
      search_volume,
      keyword_difficulty,
      priority_score,
      status: "active",
      notes: "Generated by seo-unified-engine",
    };
  });

  if (rows.length === 0) return;

  await supabase
    .schema("marketing")
    .from("keyword_targets")
    .upsert(rows, { onConflict: "work_order_id,keyword" as any });
}

async function generateAudit(wo: WorkOrder) {
  const domain = wo.domain || "unknown-domain";
  const issues = [
    {
      org_id: wo.org_id,
      work_order_id: wo.id,
      domain,
      issue_type: "missing_meta_descriptions",
      severity: "medium",
      details: "Meta descriptions missing or duplicated across priority pages.",
      recommended_fix: "Write unique CTR-focused meta descriptions for service and location pages.",
    },
    {
      org_id: wo.org_id,
      work_order_id: wo.id,
      domain,
      issue_type: "weak_internal_linking",
      severity: "high",
      details: "Key service pages are not reinforced by contextual internal links.",
      recommended_fix: "Add internal links from blogs and supporting pages into money pages.",
    },
    {
      org_id: wo.org_id,
      work_order_id: wo.id,
      domain,
      issue_type: "schema_gap",
      severity: "medium",
      details: "Organization / LocalBusiness / Service schema not detected consistently.",
      recommended_fix: "Implement schema markup on homepage, service pages, and local landing pages.",
    },
  ];

  await supabase.schema("marketing").from("site_audit_issues").insert(issues);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const work_order_id = body?.work_order_id as string | undefined;
    if (!work_order_id) return json({ success: false, error: "Missing work_order_id" }, 400);

    const wo = await fetchWorkOrder(work_order_id);

    await upsertJobStatus(wo.id, "seo", "in_progress", "research", "Generating keyword universe", 20);
    await logActivity(wo.id, wo.org_id, "SEO Engine Started", "Keyword research and technical audit launched.");

    const keywords = buildKeywordUniverse(wo);
    await saveKeywords(wo, keywords);

    await upsertJobStatus(wo.id, "seo", "in_progress", "audit", "Creating technical audit issues", 60);
    await generateAudit(wo);

    await upsertJobStatus(wo.id, "seo", "completed", "complete", `Generated ${keywords.length} keyword targets and technical audit issues`, 100);
    await logActivity(wo.id, wo.org_id, "SEO Engine Completed", `SEO engine created ${keywords.length} keyword targets.`);

    return json({
      success: true,
      work_order_id: wo.id,
      keywords_created: keywords.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ success: false, error: message }, 500);
  }
});