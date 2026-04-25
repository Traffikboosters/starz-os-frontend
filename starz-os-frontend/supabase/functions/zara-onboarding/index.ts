// supabase/functions/zara-onboarding/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const body = await req.json()

    const {
      work_order_id,
      partner_name,
      partner_email,
      business_name,
      role = "partner",
    } = body

    if (!partner_email) {
      return new Response(
        JSON.stringify({
          error: "Missing partner_email",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // ---------------------------------------------------
    // 1. GET TEMPLATE
    // ---------------------------------------------------
    const { data: template, error: templateError } = await supabase
      .schema("hr")
      .from("onboarding_templates")
      .select("*")
      .eq("role_key", role)
      .limit(1)
      .maybeSingle()

    if (templateError) {
      throw templateError
    }

    if (!template) {
      return new Response(
        JSON.stringify({
          error: `No onboarding template found for role: ${role}`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // ---------------------------------------------------
    // 2. BUILD PORTAL LINK
    // ---------------------------------------------------
    const portalLink =
      `https://starz-os-frontend.vercel.app/partner-portal?email=${encodeURIComponent(partner_email)}`

    // ---------------------------------------------------
    // 3. MERGE TEMPLATE VARIABLES
    // ---------------------------------------------------
    let subject = template.subject || "Welcome to STARZ-OS"
    let message = template.body || ""

    const replacements: Record<string, string> = {
      "{{partner_name}}": partner_name || "Partner",
      "{{business_name}}": business_name || "",
      "{{partner_email}}": partner_email,
      "{{portal_link}}": portalLink,
      "{{work_order_id}}": work_order_id || "",
    }

    for (const key in replacements) {
      subject = subject.replaceAll(key, replacements[key])
      message = message.replaceAll(key, replacements[key])
    }

    // ---------------------------------------------------
    // 4. LOG ONBOARDING EVENT
    // ---------------------------------------------------
    const { error: logError } = await supabase
      .schema("hr")
      .from("onboarding_log")
      .insert({
        role_key: role,
        email: partner_email,
        full_name: partner_name,
        business_name,
        work_order_id,
        subject,
        message,
        status: "sent",
        created_at: new Date().toISOString(),
      })

    if (logError) {
      throw logError
    }

    // ---------------------------------------------------
    // 5. OPTIONAL: UPDATE WORK ORDER
    // ---------------------------------------------------
    if (work_order_id) {
      await supabase
        .from("work_orders")
        .update({
          onboarding_sent: true,
          onboarding_sent_at: new Date().toISOString(),
        })
        .eq("work_order_id", work_order_id)
    }

    // ---------------------------------------------------
    // SUCCESS
    // ---------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        message: "Partner onboarding completed",
        partner_email,
        portal_link: portalLink,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Unexpected error",
        details: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})