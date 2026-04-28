// supabase/functions/create-subscription/index.ts

import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v) ? v : null;
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const body = await req.json();

    const {
      proposal_id,
      deal_id,
      customer_email,
      customer_name,
      amount,
      currency = "usd",
      interval = "month",
      success_url,
      cancel_url,
      description = "STARZ-OS Subscription",
    } = body ?? {};

    // ✅ strict validation
    const proposalId = asUuid(proposal_id);
    const dealId = asUuid(deal_id);
    const amountNumber = Number(amount);
    const normalizedCurrency =
      typeof currency === "string" ? currency.trim().toLowerCase() : "usd";
    const normalizedInterval =
      typeof interval === "string" ? interval.trim().toLowerCase() : "month";

    if (!proposalId || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      return json(400, {
        ok: false,
        error: "Invalid proposal_id or amount",
      });
    }

    if (!isHttpUrl(success_url) || !isHttpUrl(cancel_url)) {
      return json(400, {
        ok: false,
        error: "Invalid success_url or cancel_url",
      });
    }

    if (!["day", "week", "month", "year"].includes(normalizedInterval)) {
      return json(400, {
        ok: false,
        error: "Invalid interval. Use day, week, month, or year.",
      });
    }

    // ⚠️ optional UX guard: block already paid/active subscriptions for same proposal
    const { data: existing, error: existingErr } = await supabase
      .schema("billing")
      .from("payments")
      .select("id")
      .eq("proposal_id", proposalId)
      .in("status", ["paid", "pending"])
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      throw new Error(`Failed duplicate-check: ${existingErr.message}`);
    }

    if (existing) {
      return json(409, {
        ok: false,
        error: "Proposal already has an active or completed payment",
      });
    }

    // ✅ deterministic idempotency key
    const idempotencyKey = [
      "subscription",
      proposalId,
      dealId ?? "no_deal",
      Math.round(amountNumber * 100),
      normalizedCurrency,
      normalizedInterval,
    ].join(":");

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email:
          typeof customer_email === "string" ? customer_email : undefined,
        client_reference_id: proposalId,
        customer_creation: "always",

        line_items: [
          {
            price_data: {
              currency: normalizedCurrency,
              recurring: {
                interval:
                  normalizedInterval as Stripe.PriceCreateParams.Recurring.Interval,
              },
              product_data: {
                name:
                  typeof description === "string" && description.trim()
                    ? description.trim()
                    : "STARZ-OS Subscription",
                metadata: {
                  source: "starz_os",
                  proposal_id: proposalId,
                  deal_id: dealId ?? "",
                },
              },
              unit_amount: Math.round(amountNumber * 100),
            },
            quantity: 1,
          },
        ],

        success_url,
        cancel_url,

        metadata: {
          source: "starz_os",
          proposal_id: proposalId,
          deal_id: dealId ?? "",
          customer_name:
            typeof customer_name === "string" ? customer_name : "",
          payment_type: "subscription",
        },

        subscription_data: {
          metadata: {
            source: "starz_os",
            proposal_id: proposalId,
            deal_id: dealId ?? "",
            customer_name:
              typeof customer_name === "string" ? customer_name : "",
            payment_type: "subscription",
          },
        },
      },
      { idempotencyKey },
    );

    // ✅ optional audit record (pending until webhook confirms paid)
    await supabase.schema("billing").from("payments").insert({
      stripe_session_id: session.id,
      proposal_id: proposalId,
      deal_id: dealId,
      amount: amountNumber,
      currency: normalizedCurrency,
      payment_type: "subscription",
      status: "pending",
    });

    return json(200, {
      ok: true,
      url: session.url,
      session_id: session.id,
    });
  } catch (err: any) {
    return json(500, {
      ok: false,
      error: err?.message || "Internal error",
    });
  }
});