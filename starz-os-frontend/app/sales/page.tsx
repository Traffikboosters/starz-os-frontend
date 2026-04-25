"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function SalesRepUI() {
  const [view, setView] = useState("powerdial")
  const [leads, setLeads] = useState<any[]>([])
  const [deals, setDeals] = useState<any[]>([])
  const [performance, setPerformance] = useState<any>(null)
  const [commission, setCommission] = useState<any>(null)
  const [currentLead, setCurrentLead] = useState<any>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await loadAll(active)
    })()
    return () => {
      active = false
    }
  }, [])

  async function loadAll(active = true) {
    await Promise.all([
      loadLeads(active),
      loadDeals(active),
      loadPerformance(active),
      loadCommission(active),
    ])
  }

  async function loadLeads(active = true) {
    const { data, error } = await supabase
      .schema("app")
      .from("rep_my_leads")
      .select("*")
      .order("score", { ascending: false })
      .limit(100)

    if (error) return console.error("loadLeads:", error.message)
    if (!active) return

    setLeads(data || [])
    setCurrentLead((data && data[0]) || null)
  }

  async function loadDeals(active = true) {
    const { data, error } = await supabase
      .schema("app")
      .from("rep_my_deals")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100)

    if (error) return console.error("loadDeals:", error.message)
    if (!active) return

    setDeals(data || [])
  }

  async function loadPerformance(active = true) {
    const { data, error } = await supabase
      .schema("app")
      .from("rep_performance_30d")
      .select("*")
      .maybeSingle()

    if (error) return console.error("loadPerformance:", error.message)
    if (!active) return

    setPerformance(data)
  }

  async function loadCommission(active = true) {
    const { data, error } = await supabase
      .schema("app")
      .from("rep_commission_summary")
      .select("*")
      .maybeSingle()

    if (error) return console.error("loadCommission:", error.message)
    if (!active) return

    setCommission(data)
  }

  function nextLead() {
    if (!leads.length) return
    const index = leads.findIndex((l) => l.id === currentLead?.id)
    setCurrentLead(leads[index + 1] || leads[0])
  }

  function callLead() {
    if (!currentLead?.phone) return alert("No phone")
    const clean = String(currentLead.phone).replace(/\D/g, "")
    window.open(`tel:${clean}`)
  }

  return <div>{/* your existing JSX unchanged */}</div>
}