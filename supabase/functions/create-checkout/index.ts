// supabase/functions/create-checkout/index.ts

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

// ✅ ADDED: validation helpers
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
      amount,
      currency = "usd",
      success_url,
      cancel_url,
      description,
    } = body ?? {};

    // 🔒 SECURITY: strong required field validation
    const proposalId = asUuid(proposal_id);
    const dealId = asUuid(deal_id);
    const amountNumber = Number(amount);
    const currencyCode =
      typeof currency === "string" ? currency.trim().toLowerCase() : "usd";

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

    // ⚠️ DO NOT REMOVE: deterministic idempotency (prevents double session/charge creation)
    const idempotencyKey = `checkout:${proposalId}:${Math.round(
      amountNumber * 100,
    )}:${currencyCode}:${dealId ?? "none"}`;

    // 💳 CREATE STRIPE CHECKOUT SESSION
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: typeof customer_email === "string" ? customer_email : undefined,
        client_reference_id: proposalId, // ✅ ADDED: easier reconciliation in Stripe dashboard
        line_items: [
          {
            price_data: {
              currency: currencyCode,
              product_data: {
                name:
                  typeof description === "string" && description.trim().length > 0
                    ? description.trim()
                    : "Service Payment",
              },
              unit_amount: Math.round(amountNumber * 100),
            },
            quantity: 1,
          },
        ],
        success_url,
        cancel_url,

        // ⚠️ DO NOT REMOVE: metadata used by stripe-webhook mapping
        metadata: {
          proposal_id: proposalId,
          deal_id: dealId ?? "",
          source: "starz_os",
        },
      },
      {
        idempotencyKey,
      },
    );

    // ✅ ADDED: optional lightweight audit trail (non-blocking on failure)
    await supabase.schema("billing").from("payments").insert({
      stripe_session_id: session.id,
      proposal_id: proposalId,
      deal_id: dealId,
      amount: amountNumber,
      currency: currencyCode,
      payment_type: "one_time",
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