"use client"
import { useEffect, useMemo, useState } from "react"
import { engine } from "@/lib/api"
type UserRow = { id: string; name: string; email?: string; role: string; is_active: boolean }
export default function AutoRecruitPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [threshold, setThreshold] = useState(15)
  const [inviteEmails, setInviteEmails] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("idle")
  const activeContractors = useMemo(() => users.filter(u => u.is_active && (u.role === "bge_contractor" || u.role === "contractor")).length, [users])
  const belowThreshold = activeContractors < threshold
  useEffect(() => { refreshUsers() }, [])
  async function fetchUsers(): Promise<UserRow[]> {
    const res = await engine<UserRow[]>("core-automation-engine", "get_users")
    return Array.isArray(res?.data) ? res.data : []
  }
  async function refreshUsers() {
    try { setUsers(await fetchUsers()) } catch (err) { console.error(err); setStatus("failed_loading_users") }
  }
  function parseEmails(raw: string) { return raw.split(/[,\n;]/g).map(s => s.trim()).filter(Boolean) }
  async function runAutoRecruit() {
    try {
      setBusy(true); setStatus("running")
      const latestUsers = await fetchUsers()
      setUsers(latestUsers)
      const active = latestUsers.filter(u => u.is_active && (u.role === "bge_contractor" || u.role === "contractor")).length
      if (active >= threshold) { setStatus("healthy_no_action"); return }
      await engine("outreach-engine", "post_job", { title: "Make Money as a Business Growth Expert (BGE)", description: "Close deals using our system. We provide leads, tools, and training.", platforms: ["craigslist", "indeed", "monster"] })
      const emails = parseEmails(inviteEmails)
      for (const to of emails) { await engine("outreach-engine", "send_email", { to, subject: "Become a Business Growth Expert (BGE)", body: "Hi there,\n\nWe are onboarding BGEs at Traffik Boosters.\n\nReply to continue.\n\n- Zara, HR Director" }) }
      setStatus(emails.length > 0 ? "jobs_posted_and_invites_sent" : "jobs_posted")
    } catch (err) { console.error(err); setStatus("failed") } finally { setBusy(false) }
  }
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">AUTO RECRUIT MODE</h1><p className="text-zinc-400">Auto-post jobs + optional invite blast when active contractors are below threshold.</p></div>
      <div className="bg-zinc-900 p-4 rounded-xl space-y-2">
        <p>Active Contractors: <span className="font-bold">{activeContractors}</span></p>
        <p>Threshold: <span className="font-bold">{threshold}</span></p>
        <p className={belowThreshold ? "text-yellow-400" : "text-green-400"}>{belowThreshold ? "Below threshold (recruit action needed)" : "Healthy (no action needed)"}</p>
      </div>
      <div className="space-y-3">
        <label className="block text-sm text-zinc-400">Contractor Threshold</label>
        <input type="number" min={1} value={threshold} onChange={e => setThreshold(Number(e.target.value || 1))} className="bg-zinc-800 p-2 rounded w-full" />
        <label className="block text-sm text-zinc-400">Invite Emails (comma/newline separated, optional)</label>
        <textarea value={inviteEmails} onChange={e => setInviteEmails(e.target.value)} placeholder="a@x.com, b@y.com" className="bg-zinc-800 p-2 rounded w-full min-h-[120px]" />
      </div>
      <div className="flex gap-2">
        <button onClick={runAutoRecruit} disabled={busy} className="bg-purple-600 px-4 py-2 rounded disabled:opacity-50">{busy ? "Running..." : "Run Auto Recruit"}</button>
        <button onClick={refreshUsers} disabled={busy} className="bg-zinc-700 px-4 py-2 rounded disabled:opacity-50">Refresh Users</button>
      </div>
      <p className="text-sm text-zinc-400">Status: {status}</p>
    </div>
  )
}