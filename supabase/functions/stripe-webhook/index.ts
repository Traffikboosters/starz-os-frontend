// supabase/functions/stripe-webhook/index.ts

import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const INTERNAL_AUTOMATION_SECRET = Deno.env.get("INTERNAL_AUTOMATION_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ✅ ADDED: defensive UUID normalizer to avoid insert failures
function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(v) ? v : null;
}

Deno.serve(async (req) => {
  let event: Stripe.Event | null = null;
  let eventLocked = false;

  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return json(400, { ok: false, error: "Missing stripe-signature header" });
    }

    // 🔒 SECURITY: RAW BODY REQUIRED FOR STRIPE SIGNATURE VERIFICATION
    const body = await req.text();

    try {
      event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      return json(400, { ok: false, error: `Webhook Error: ${err.message}` });
    }

    const eventId = event.id;

    // ⚠️ DO NOT REMOVE: atomic idempotency lock
    const { error: lockError } = await supabase
      .schema("billing") // ✅ ADDED: correct schema usage
      .from("stripe_events")
      .insert({
        event_id: eventId,
        event_type: event.type,
      });

    if (lockError) {
      // ✅ ADDED: unique violation => already processed (retry-safe)
      if ((lockError as any).code === "23505") {
        return json(200, { ok: true, duplicate: true });
      }
      throw new Error(`Failed to lock event: ${lockError.message}`);
    }

    eventLocked = true;

    // ============================================================
    // 💰 SUCCESSFUL PAYMENT HANDLING
    // ============================================================
    if (
      event.type === "checkout.session.completed" ||
      event.type === "invoice.paid" ||
      event.type === "payment_intent.succeeded"
    ) {
      const obj: any = event.data.object;

      const proposal_id = asUuid(obj?.metadata?.proposal_id);
      const deal_id = asUuid(obj?.metadata?.deal_id);

      const amount =
        typeof obj.amount_total === "number"
          ? obj.amount_total / 100
          : typeof obj.amount_received === "number"
          ? obj.amount_received / 100
          : typeof obj.amount_paid === "number"
          ? obj.amount_paid / 100
          : 0;

      // ✅ ADDED: safer payment_type inference across Stripe object types
      const payment_type =
        obj.mode === "subscription" || event.type === "invoice.paid"
          ? "subscription"
          : "one_time";

      const { error: paymentInsertError } = await supabase
        .schema("billing")
        .from("payments")
        .insert({
          stripe_session_id: obj.id ?? null,
          stripe_customer_id: obj.customer ?? null,
          proposal_id,
          deal_id,
          amount,
          currency: obj.currency ?? "usd",
          payment_type,
          status: "paid",
        });

      if (paymentInsertError) {
        throw new Error(`Failed to store paid payment: ${paymentInsertError.message}`);
      }

      // 🧩 CONVERT PROPOSAL → WORK ORDER
      if (proposal_id) {
        const { error: convertError } = await supabase.rpc(
          "convert_proposal_to_work_order",
          {
            p_proposal_id: proposal_id,
          },
        );
        if (convertError) {
          throw new Error(`convert_proposal_to_work_order failed: ${convertError.message}`);
        }

        // ⏳ START 3-DAY PROBATION
        const { error: probationError } = await supabase.rpc(
          "start_work_order_probation",
          {
            p_proposal_id: proposal_id,
          },
        );
        if (probationError) {
          throw new Error(`start_work_order_probation failed: ${probationError.message}`);
        }
      }

      // 🚀 TRIGGER CORE ENGINE (SAFE INTERNAL CALL)
      const coreResp = await fetch(`${SUPABASE_URL}/functions/v1/core-automation-engine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "x-internal-token": INTERNAL_AUTOMATION_SECRET,
        },
        body: JSON.stringify({
          action: "payment_received",
          proposal_id,
          deal_id,
          amount,
        }),
      });

      if (!coreResp.ok) {
        throw new Error(`core-automation-engine payment_received failed: HTTP ${coreResp.status}`);
      }
    }

    // ============================================================
    // ❌ FAILED PAYMENT HANDLING
    // ============================================================
    if (
      event.type === "invoice.payment_failed" ||
      event.type === "payment_intent.payment_failed"
    ) {
      const obj: any = event.data.object;

      const amount =
        typeof obj.amount_due === "number"
          ? obj.amount_due / 100
          : typeof obj.amount === "number"
          ? obj.amount / 100
          : 0;

      const { error: failedPaymentInsertError } = await supabase
        .schema("billing")
        .from("payments")
        .insert({
          stripe_session_id: obj.id ?? null,
          stripe_customer_id: obj.customer ?? null,
          amount,
          currency: obj.currency ?? "usd",
          payment_type: "subscription",
          status: "failed",
        });

      if (failedPaymentInsertError) {
        throw new Error(
          `Failed to store failed payment: ${failedPaymentInsertError.message}`,
        );
      }

      // 🚨 NOTIFY SYSTEM
      const coreResp = await fetch(`${SUPABASE_URL}/functions/v1/core-automation-engine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "x-internal-token": INTERNAL_AUTOMATION_SECRET,
        },
        body: JSON.stringify({
          action: "payment_failed",
          customer_id: obj.customer ?? null,
        }),
      });

      if (!coreResp.ok) {
        throw new Error(`core-automation-engine payment_failed failed: HTTP ${coreResp.status}`);
      }
    }

    return json(200, { ok: true });
  } catch (err: any) {
    // ✅ ADDED: unlock event on internal failure so Stripe can retry safely
    if (eventLocked && event?.id) {
      await supabase
        .schema("billing")
        .from("stripe_events")
        .delete()
        .eq("event_id", event.id);
    }

    return json(500, {
      ok: false,
      error: err?.message || "Internal error",
    });
  }
});