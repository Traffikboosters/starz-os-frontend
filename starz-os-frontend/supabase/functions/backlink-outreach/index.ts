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
    event_type: "backlink_outreach",
    title,
    message,
  });
}

// simulate email send (replace later with Resend or SMTP)
async function sendEmail(to: string, subject: string, message: string) {
  console.log("Sending email →", to, subject);
  return { success: true };
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

    // Fetch queue
    const { data: queue, error } = await supabase
      .schema("marketing")
      .from("outreach_queue")
      .select("*")
      .eq("work_order_id", work_order_id)
      .eq("status", "pending")
      .limit(20);

    if (error) throw error;

    let sent = 0;

    for (const item of queue || []) {
      const result = await sendEmail(item.to_email, item.subject, item.message);

      if (result.success) {
        await supabase
          .schema("marketing")
          .from("outreach_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            attempts: (item.attempts || 0) + 1,
          })
          .eq("id", item.id);

        sent++;
      } else {
        await supabase
          .schema("marketing")
          .from("outreach_queue")
          .update({
            attempts: (item.attempts || 0) + 1,
            status: "failed",
          })
          .eq("id", item.id);
      }
    }

    // Log result
    const { data: wo } = await supabase
      .schema("fulfillment")
      .from("work_orders")
      .select("org_id")
      .eq("id", work_order_id)
      .single();

    if (wo) {
      await log(work_order_id, wo.org_id, "📬 Outreach Sent", `${sent} outreach emails sent`);
    }

    return json({ success: true, sent });

  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});