import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const DIALPAD_API_KEY = Deno.env.get("DIALPAD_API_KEY") ?? "";
const DIALPAD_BASE = "https://dialpad.com/api/v2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { action, phone_number, user_id, call_id } = body;

    if (!DIALPAD_API_KEY) {
      return new Response(JSON.stringify({ error: "DIALPAD_API_KEY not configured" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let url = "";
    let method = "GET";
    let reqBody: string | undefined;

    if (action === "get_me") {
      url = `${DIALPAD_BASE}/users/me?apikey=${DIALPAD_API_KEY}`;
    } else if (action === "initiate_call") {
      url = `${DIALPAD_BASE}/users/${user_id}/initiate_call?apikey=${DIALPAD_API_KEY}`;
      method = "POST";
      reqBody = JSON.stringify({ phone_number });
    } else if (action === "get_call") {
      url = `${DIALPAD_BASE}/calls/${call_id}?apikey=${DIALPAD_API_KEY}`;
    } else if (action === "list_calls") {
      url = `${DIALPAD_BASE}/calls?apikey=${DIALPAD_API_KEY}&limit=50`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      ...(reqBody ? { body: reqBody } : {}),
    });

    const rawText = await resp.text();
    let data: unknown;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText, status: resp.status }; }

    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});