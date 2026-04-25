import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type WorkOrder = {
  id: string;
  org_id: string;
  domain: string | null;
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
    event_type: "authority_engine",
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
        engine_name: "authority-engine",
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
    .select("id, org_id, domain")
    .eq("id", work_order_id)
    .single();

  if (error || !data) throw new Error("Work order not found for authority engine");
  return data as WorkOrder;
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

    await upsertJobStatus(work_order_id, "authority", "in_progress", "aggregate", "Computing authority metrics", 20);
    await logActivity(work_order_id, wo.org_id, "Authority Engine Started", "Computing STARZ authority score from SEO, backlink, and growth data.");

    const [
      { count: referringDomainsCount },
      { count: liveBacklinksCount },
      { count: keywordTargetsCount },
      { count: rankingKeywordsCount },
      { data: auditIssues },
      { data: backlinks },
      { data: previousSnapshots },
    ] = await Promise.all([
      supabase.schema("marketing")
        .from("backlink_prospects")
        .select("source_domain", { count: "exact", head: true })
        .eq("work_order_id", work_order_id)
        .in("status", ["qualified", "contacted", "won"]),

      supabase.schema("marketing")
        .from("backlinks")
        .select("id", { count: "exact", head: true })
        .eq("work_order_id", work_order_id)
        .eq("live_status", "live"),

      supabase.schema("marketing")
        .from("keyword_targets")
        .select("id", { count: "exact", head: true })
        .eq("work_order_id", work_order_id),

      supabase.schema("analytics")
        .from("keyword_rankings")
        .select("id", { count: "exact", head: true })
        .eq("work_order_id", work_order_id)
        .lte("rank_position", 20),

      supabase.schema("marketing")
        .from("site_audit_issues")
        .select("severity, status")
        .eq("work_order_id", work_order_id),

      supabase.schema("marketing")
        .from("backlinks")
        .select("authority_estimate,relevance_score,live_status")
        .eq("work_order_id", work_order_id),

      supabase.schema("analytics")
        .from("authority_snapshots")
        .select("authority_score, created_at")
        .eq("work_order_id", work_order_id)
        .order("created_at", { ascending: false })
        .limit(2),
    ]);

    const openIssues = (auditIssues || []).filter((x: any) => x.status === "open");
    const weightedPenalty = openIssues.reduce((sum: number, issue: any) => {
      if (issue.severity === "high") return sum + 8;
      if (issue.severity === "medium") return sum + 4;
      return sum + 2;
    }, 0);

    const technical_health_score = Math.max(0, 15 - weightedPenalty * 0.6);
    const content_coverage_score = Math.min(10, ((keywordTargetsCount || 0) / 10) * 2);
    const liveBacklinks = (backlinks || []).filter((x: any) => x.live_status === "live");
    const avgAuthority =
      liveBacklinks.length > 0
        ? liveBacklinks.reduce((s: number, x: any) => s + Number(x.authority_estimate || 0), 0) / liveBacklinks.length
        : 0;
    const avgRelevance =
      liveBacklinks.length > 0
        ? liveBacklinks.reduce((s: number, x: any) => s + Number(x.relevance_score || 0), 0) / liveBacklinks.length
        : 0;

    const backlink_quality_score = Math.min(10, (avgAuthority * 0.08 + avgRelevance * 0.04));
    const prevScore = previousSnapshots && previousSnapshots[1] ? Number(previousSnapshots[1].authority_score || 0) : 0;
    const latestScore = previousSnapshots && previousSnapshots[0] ? Number(previousSnapshots[0].authority_score || 0) : 0;
    const rawMomentum = Math.max(0, latestScore - prevScore);
    const momentum_score = Math.min(5, rawMomentum);

    const { data: computeRes, error: computeError } = await supabase.rpc("compute_authority_score", {
      p_referring_domains: referringDomainsCount || 0,
      p_live_backlinks: liveBacklinksCount || 0,
      p_keyword_targets: keywordTargetsCount || 0,
      p_ranking_keywords: rankingKeywordsCount || 0,
      p_technical_health_score: technical_health_score,
      p_content_coverage_score: content_coverage_score,
      p_backlink_quality_score: backlink_quality_score,
      p_momentum_score: momentum_score,
    });

    if (computeError) throw computeError;

    const authority_score = Number(computeRes || 0);

    await supabase.schema("analytics").from("authority_snapshots").insert({
      org_id: wo.org_id,
      work_order_id,
      domain: wo.domain || "unknown-domain",
      authority_score,
      referring_domains: referringDomainsCount || 0,
      live_backlinks: liveBacklinksCount || 0,
      keyword_targets: keywordTargetsCount || 0,
      ranking_keywords: rankingKeywordsCount || 0,
      technical_health_score,
      content_coverage_score,
      backlink_quality_score,
      momentum_score,
      notes: "Snapshot generated by authority-engine",
    });

    await upsertJobStatus(
      work_order_id,
      "authority",
      "completed",
      "complete",
      `Authority score updated to ${authority_score}`,
      100
    );

    await logActivity(
      work_order_id,
      wo.org_id,
      "Authority Engine Completed",
      `STARZ authority score updated to ${authority_score}.`
    );

    return json({
      success: true,
      work_order_id,
      authority_score,
      referring_domains: referringDomainsCount || 0,
      live_backlinks: liveBacklinksCount || 0,
      keyword_targets: keywordTargetsCount || 0,
      ranking_keywords: rankingKeywordsCount || 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ success: false, error: message }, 500);
  }
});