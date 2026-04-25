"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PartnerDashboard() {
  const [orders, setOrders] = useState<any[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase
      .from("fulfillment_workorders_v")
      .select("*")
      .order("created_at", { ascending: false })

    setOrders(data || [])
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>💳 Partner Dashboard</h1>

      {orders.map(o => (
        <div key={o.id}>
          {o.business_name} - {o.status}
        </div>
      ))}
    </div>
  )
}