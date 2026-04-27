'use client'

import { useEffect, useState } from 'react'
import { engine } from '@/lib/api'

export type WorkOrder = {
  id: string
  title?: string
  status: string
  assigned_to?: string
  created_at: string
  total_amount?: number
  service_type?: string
  payment_status?: string
}

export type Deal = {
  id: string
  company_name?: string
  contact_name?: string
  stage: string
  value?: number
  services?: string[]
  created_at: string
}

type RicoData = {
  workOrders: WorkOrder[]
  deals: Deal[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useRicoData(): RicoData {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    try {
      setLoading(true)
      setError(null)

      const [woRes, dealsRes] = await Promise.all([
        engine<WorkOrder[]>('rico-engine', 'get_work_orders'),
        engine<Deal[]>('rico-engine', 'get_deals'),
      ])

      setWorkOrders(Array.isArray(woRes?.data) ? woRes.data : [])
      setDeals(Array.isArray(dealsRes?.data) ? dealsRes.data : [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Rico data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return { workOrders, deals, loading, error, refresh: fetchData }
}
