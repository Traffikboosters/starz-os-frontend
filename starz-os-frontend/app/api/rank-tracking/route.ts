const supabaseUrl=process.env. https://szguizvpiiuiyugrjeks.supabase.co/functions/v1/rank-tracking" `
const serviceRoleKey=process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6Z3VpenZwaWl1aXl1Z3JqZWtzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTMyNTg5MiwiZXhwIjoyMDc2OTAxODkyfQ.VPnGM9so9Cp56GV6v6tafzKKs45eNUKpkpwD65Hn7PM

if (!supabaseUrl || !serviceRoleKey) {
  return NextResponse.json(
    {
      ok: false,
      error: "Missing env vars",
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
    },
    { status: 500 }
  )
}
