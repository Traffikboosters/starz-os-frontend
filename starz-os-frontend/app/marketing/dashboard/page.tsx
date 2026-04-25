"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

type AuthorityRow = {
  id: string | number
  created_at: string
  authority_score: number | null
  referring_domains: number | null
}

type BacklinkRow = {
  id: string | number
  source_domain: string | null
  target_domain: string | null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Dashboard() {
  const [authority, setAuthority] = useState<AuthorityRow[]>([])
  const [backlinks, setBacklinks] = useState<BacklinkRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setError(null)
    setLoading(true)

    const [authorityRes, backlinksRes] = await Promise.all([
      supabase
        .from("authority_snapshots_v")
        .select("id, created_at, authority_score, referring_domains")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("marketing_backlinks_v")
        .select("id, source_domain, target_domain")
        .limit(20),
    ])

    if (authorityRes.error || backlinksRes.error) {
      setError(authorityRes.error?.message || backlinksRes.error?.message || "Failed to load data")
      setLoading(false)
      return
    }

    setAuthority((authorityRes.data ?? []) as AuthorityRow[])
    setBacklinks((backlinksRes.data ?? []) as BacklinkRow[])
    setLoading(false)
  }

  return (
    <div style={{ padding: 30, background: "#0f172a", minHeight: "100vh", color: "#fff" }}>
      <h1>📊 STARZ-OS Authority Dashboard</h1>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "#f87171" }}>Error: {error}</p>}

      <h2 style={{ marginTop: 30 }}>🔥 Authority Growth</h2>
      <div style={{ background: "#1e293b", padding: 20 }}>
        {authority.map((a, i) => (
          <div key={a.id ?? i}>
            Score: {a.authority_score ?? "-"} | Domains: {a.referring_domains ?? "-"}
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 30 }}>🔗 Backlinks</h2>
      <div style={{ background: "#1e293b", padding: 20 }}>
        {backlinks.map((b, i) => (
          <div key={b.id ?? i}>
            {b.source_domain ?? "-"} → {b.target_domain ?? "-"}
          </div>
        ))}
      </div>
    </div>
  )
}