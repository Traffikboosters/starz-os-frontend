import { NextResponse } from "next/server";
// Add your auth/session validation here before data fetch.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const threadId = url.searchParams.get("thread_id");

  const endpoint = threadId
    ? `${process.env.SUPABASE_URL}/rest/v1/emails?select=*&thread_id=eq.${threadId}&order=created_at.desc`
    : `${process.env.SUPABASE_URL}/rest/v1/emails?select=*&order=priority.desc,created_at.desc&limit=200`;

  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      "Accept-Profile": "communications"
    },
    cache: "no-store"
  });

  return NextResponse.json(await res.json(), { status: res.status });
}