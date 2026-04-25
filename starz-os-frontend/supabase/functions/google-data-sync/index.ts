const GSC_TOKEN = Deno.env.get("GSC_TOKEN");

Deno.serve(async (req) => {
  const { domain } = await req.json();

  // Simulated call (replace with Google API)
  const data = {
    clicks: 120,
    impressions: 4000,
    ctr: 3.2,
    avg_position: 18
  };

  return new Response(JSON.stringify(data));
});