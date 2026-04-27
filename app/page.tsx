'use client'

import { useEffect, useState } from 'react'
import { engine } from '@/lib/api'

type Stats = {
  pipeline_deals: number
  active_leads: number
  work_orders: number
  revenue: number
  close_rate: number
  deals_won: number
}

export default function Page() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    engine<Stats>('core-automation-engine', 'get_dashboard_stats')
      .then(res => { if (res?.data) setStats(res.data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const fmt = (n: number) => n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'K' : '$' + n

  return (
    <main className="min-h-screen text-white bg-[radial-gradient(circle_at_20%_20%,#1a1f3a,transparent),radial-gradient(circle_at_80%_80%,#0b0f1a,black)]">

      {/* HEADER */}
      <div className="flex justify-between items-center px-10 py-6">
        <div>
          <h1 className="text-2xl font-bold">🚀 STARZ-OS v8.0</h1>
          <p className="text-sm opacity-50">Orbital Command Center</p>
        </div>
        <div className="text-right">
          <p className="text-green-400 text-sm">● Systems Online</p>
          <p className="text-xs opacity-60">Commander DJ</p>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-3 gap-8 px-10">

        {/* LEFT PANEL */}
        <div className="space-y-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold mb-4">Mission Control</h2>
            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[...Array(3)].map((_, i) => <div key={i} className="h-4 bg-white/10 rounded" />)}
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="opacity-60">Pipeline Deals</span><span className="text-cyan-400 font-mono">{stats?.pipeline_deals ?? '—'}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Active Leads</span><span className="text-green-400 font-mono">{stats?.active_leads ?? '—'}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Work Orders</span><span className="text-pink-400 font-mono">{stats?.work_orders ?? '—'}</span></div>
              </div>
            )}
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold mb-4">Live KPIs</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Revenue', value: stats ? fmt(stats.revenue) : '—', color: 'text-purple-400' },
                { label: 'Leads', value: stats?.active_leads ?? '—', color: 'text-cyan-400' },
                { label: 'Close Rate', value: stats ? stats.close_rate + '%' : '—', color: 'text-pink-400' },
                { label: 'Won', value: stats?.deals_won ?? '—', color: 'text-green-400' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <div className={`text-xl font-bold font-mono ${kpi.color}`}>{loading ? '—' : kpi.value}</div>
                  <div className="text-[10px] text-white/40 uppercase mt-1">{kpi.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="text-center opacity-40">
            <div className="text-6xl mb-4">⚡</div>
            <p className="text-lg tracking-wide">STARZ-OS Core Active</p>
            <p className="text-sm mt-2">All engines running</p>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="space-y-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: '/rico', label: 'Rico', color: 'from-cyan-400 to-blue-500', emoji: '📋' },
                { href: '/hr/auto-recruit', label: 'Recruit', color: 'from-purple-500 to-pink-500', emoji: '👥' },
                { href: '/hr/onboarding', label: 'Onboard', color: 'from-green-500 to-emerald-500', emoji: '🎯' },
                { href: '/hr/performance', label: 'Performance', color: 'from-amber-500 to-orange-500', emoji: '📊' },
              ].map(a => (
                <a key={a.href} href={a.href} className={`py-3 rounded-xl bg-gradient-to-r ${a.color} text-black font-semibold hover:scale-105 transition text-center text-sm`}>
                  {a.emoji} {a.label}
                </a>
              ))}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold mb-3">Navigation</h2>
            <div className="space-y-2 text-sm">
              {[
                { href: '/rico', label: '📋 Rico Dashboard' },
                { href: '/hr/auto-recruit', label: '🤖 Auto Recruit' },
                { href: '/hr/onboarding', label: '🎯 Onboarding' },
                { href: '/hr/performance', label: '📊 Performance' },
              ].map(link => (
                <a key={link.href} href={link.href} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors opacity-70 hover:opacity-100">
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ORBITAL DOCK */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2">
        <div className="flex gap-3 bg-black/40 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl">
          {[
            { href: '/', bg: 'bg-purple-500', label: '🏠' },
            { href: '/rico', bg: 'bg-cyan-400', label: '📋' },
            { href: '/hr/auto-recruit', bg: 'bg-pink-500', label: '👥' },
            { href: '/hr/onboarding', bg: 'bg-green-500', label: '🎯' },
            { href: '/hr/performance', bg: 'bg-amber-500', label: '📊' },
          ].map((item, i) => (
            <a key={i} href={item.href} className={`w-12 h-12 rounded-xl ${item.bg} hover:scale-110 hover:-translate-y-2 transition duration-300 shadow-lg flex items-center justify-center text-lg`}>
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
