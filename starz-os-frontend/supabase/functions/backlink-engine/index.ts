import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type WorkOrder = {
  id: string;
  org_id: string;
  domain: string | null;
  business_name?: string | null;
  service_type?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
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
    event_type: "backlink_engine",
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
        engine_name: "backlink-engine",
        module,
        status,
        step_name,
        detail,
        progress_pct,
      });
  }
}

async function fetchWorkOrder(work_order_id: string): Promise<WorkOrder> {
  const { data, error } = await supabase
    .schema("fulfillment")
    .from("work_orders")
    .select("id, org_id, domain, business_name, service_type, city, state, country")
    .eq("id", work_order_id)
    .single();

  if (error || !data) throw new Error("Work order not found for backlink engine");
  return data as WorkOrder;
}

function authorityEstimate(domain: string): number {
  let score = 25;
  if (domain.endsWith(".org")) score += 10;
  if (domain.endsWith(".edu")) score += 18;
  if (domain.includes("news")) score += 8;
  if (domain.includes("blog")) score += 5;
  if (domain.split(".").length <= 2) score += 6;
  return Math.min(90, score);
}

function relevanceScore(sourceDomain: string, targetDomain: string, niche: string): number {
  let score = 40;
  if (sourceDomain.includes(niche.toLowerCase().replace(/\s+/g, ""))) score += 20;
  if (sourceDomain.includes(targetDomain.split(".")[0])) score += 10;
  if (sourceDomain.includes("directory")) score -= 5;
  if (sourceDomain.includes("forum")) score -= 8;
  return Math.max(5, Math.min(95, score));
}

function spamRiskScore(sourceDomain: string): number {
  let score = 10;
  if (sourceDomain.includes("free")) score += 12;
  if (sourceDomain.includes("casino")) score += 35;
  if (sourceDomain.includes("crypto")) score += 15;
  if (sourceDomain.includes("forum")) score += 10;
  return Math.min(100, score);
}

function generateProspects(wo: WorkOrder) {
  const domain = (wo.domain || "example.com").replace(/^https?:\/\//, "").replace(/^www\./, "");
  const root = domain.split(".")[0];
  const niche = (wo.service_type || "marketing").toLowerCase();
  const geo = [wo.city, wo.state].filter(Boolean).join("-").toLowerCase();

  const domains = [
    `${niche}blog.com`,
    `${niche}directory.org`,
    `best${niche}news.com`,
    `${geo ? `${geo}-` : ""}${niche}guide.com`,
    `${root}partners.com`,
    `${niche}resources.net`,
    `${niche}journal.org`,
    `${niche}insightsblog.com`,
    `${geo ? `${geo}-` : ""}${niche}businessdirectory.com`,
    `${niche}todaynews.com`,
  ];

  return domains.map((source_domain, idx) => {
    const authority_estimate = authorityEstimate(source_domain);
    const relevance_score = relevanceScore(source_domain, domain, niche);
    const spam_risk_score = spamRiskScore(source_domain);

    return {
      source_domain,
      source_url: `https://${source_domain}/write-for-us`,
      contact_name: `Editor ${idx + 1}`,
      contact_email: `editor@${source_domain}`,
      niche,
      prospect_type: idx % 3 === 0 ? "guest_post" : idx % 3 === 1 ? "niche_edit" : "directory",
      relevance_score,
      authority_estimate,
      spam_risk_score,
      status: spam_risk_score >= 45 ? "rejected" : "qualified",
      notes: "Generated prospect by backlink-engine",
    };
  });
}

function buildOutreachMessage(params: {
  businessName: string;
  sourceDomain: string;
  niche: string;
  targetDomain: string;
}) {
  const { businessName, sourceDomain, niche, targetDomain } = params;
  const subject = `Content collaboration opportunity for ${sourceDomain}`;
  const message = [
    `Hi,`,
    ``,
    `I’m reaching out on behalf of ${businessName}. We’re looking to contribute a high-quality article relevant to ${niche} audiences.`,
    `Our goal is to create something genuinely useful for your readers and reference a relevant resource from ${targetDomain} where appropriate.`,
    `If you accept guest posts or editorial contributions, we’d love to send topic ideas.`,
    ``,
    `Best,`,
    `Rico Fulfillment Team`,
  ].join("\n");

  return { subject, message };
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
    const businessName = wo.business_name || wo.domain || "Client Business";
    const targetDomain = (wo.domain || "example.com").replace(/^https?:\/\//, "").replace(/^www\./, "");
    const niche = (wo.service_type || "marketing").toLowerCase();

    await upsertJobStatus(work_order_id, "backlinks", "in_progress", "prospecting", "Generating backlink prospects", 20);
    await logActivity(work_order_id, wo.org_id, "Backlink Engine Started", "Prospecting backlink opportunities and generating outreach queue.");

    const prospects = generateProspects(wo);
    const rows = prospects.map((p) => ({
      org_id: wo.org_id,
      work_order_id,
      ...p,
    }));

    if (rows.length > 0) {
      await supabase.schema("marketing").from("backlink_prospects").insert(rows);
    }

    await upsertJobStatus(work_order_id, "backlinks", "in_progress", "queueing", "Queueing outreach", 65);

    const qualified = rows.filter((p) => p.status === "qualified");
    const outreachRows = qualified.map((p) => {
      const msg = buildOutreachMessage({
        businessName,
        sourceDomain: p.source_domain,
        niche,
        targetDomain,
      });

      return {
        org_id: wo.org_id,
        work_order_id,
        to_email: p.contact_email!,
        to_name: p.contact_name,
        subject: msg.subject,
        message: msg.message,
        channel: "email",
        status: "pending",
      };
    });

    if (outreachRows.length > 0) {
      await supabase.schema("marketing").from("outreach_queue").insert(outreachRows);
    }

    await upsertJobStatus(
      work_order_id,
      "backlinks",
      "completed",
      "complete",
      `Generated ${rows.length} prospects and queued ${outreachRows.length} outreach items`,
      100
    );

    await logActivity(
      work_order_id,
      wo.org_id,
      "Backlink Engine Completed",
      `Created ${rows.length} backlink prospects and ${outreachRows.length} outreach queue items.`
    );

    return json({
      success: true,
      work_order_id,
      prospects_created: rows.length,
      outreach_queued: outreachRows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ success: false, error: message }, 500);
  }
});