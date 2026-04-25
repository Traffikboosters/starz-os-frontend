"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ExecutiveDashboard() {
  const [metrics, setMetrics] = useState<any>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {

    const [deals, authority, backlinks] = await Promise.all([
      supabase.from("deals.pipeline").select("value"),
      supabase.from("authority_snapshots_v").select("authority_score").limit(10),
      supabase.from("marketing_backlinks_v").select("*")
    ])

    const revenue = deals.data?.reduce((a: any, b: any) => a + (b.value || 0), 0)

    setMetrics({
      revenue,
      authority: authority.data?.[0]?.authority_score || 0,
      backlinks: backlinks.data?.length || 0
    })
  }

  return (
    <div style={{ padding: 30, background: "#020617", color: "#fff", minHeight: "100vh" }}>
      <h1>🧠 STARZ Executive Command Center</h1>

      <div style={{ display: "flex", gap: 20 }}>
        <Card title="Revenue" value={`$${metrics.revenue || 0}`} />
        <Card title="Authority Score" value={metrics.authority} />
        <Card title="Backlinks" value={metrics.backlinks} />
      </div>
    </div>
  )
}

function Card({ title, value }: any) {
  return (
    <div style={{ background: "#1e293b", padding: 20 }}>
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  )
}