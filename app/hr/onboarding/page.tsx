"use client"

import { useEffect, useMemo, useState } from "react"
import { engine } from "@/lib/api"

type UserRow = {
  id: string
  name: string
  email?: string
  role: string
  is_active: boolean
}

type LeadRow = {
  id: string
  status?: string
  assigned_to?: string | null
}

export default function FullOnboardingPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [starterLeadCount, setStarterLeadCount] = useState(10)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("idle")

  const contractors = useMemo(
    () =>
      users.filter(
        (u) =>
          u.is_active &&
          (u.role === "bge_contractor" || u.role === "contractor")
      ),
    [users]
  )

  const selectedUser = useMemo(
    () => contractors.find((u) => u.id === selectedUserId),
    [contractors, selectedUserId]
  )

  useEffect(() => {
    refreshUsers()
  }, [])

  async function refreshUsers() {
    try {
      const res = await engine<UserRow[]>("core-automation-engine", "get_users")
      setUsers(Array.isArray(res?.data) ? res.data : [])
      setStatus("users_loaded")
    } catch (err) {
      console.error(err)
      setStatus("failed_loading_users")
    }
  }

  async function sendWelcomeAndTraining(user: UserRow) {
    if (!user.email) return
    await engine("outreach-engine", "send_email", {
      to: user.email,
      subject: "Welcome to Traffik Boosters - BGE Onboarding (Day 1)",
      body: `Hi ${user.name || "there"},\n\nWelcome aboard as a Business Growth Expert (BGE).\n\nDay 1 Focus:\n1) Learn the offer + script\n2) Review objection handling\n3) Complete your first calls\n4) Update your pipeline daily\n\nTraining Checklist:\n- Read the BGE Quickstart\n- Practice opening script 10x\n- Submit first 3 call outcomes\n- Book at least 1 follow-up\n\nReply with: "READY" once complete.\n\n- Zara, HR Director`,
    })
  }

  async function createDayOneTasks(user: UserRow) {
    const tasks = [
      "Read BGE Quickstart Guide",
      "Practice opener script (10 reps)",
      "Complete first 10 outreach calls",
      "Log call outcomes in CRM",
      "Book at least 1 follow-up call",
    ]
    for (const title of tasks) {
      await engine("core-automation-engine", "create_task", {
        user_id: user.id,
        title,
        priority: "high",
        category: "onboarding",
      })
    }
  }

  async function assignStarterLeads(user: UserRow, count: number): Promise<number> {
    const res = await engine<LeadRow[]>("sales-engine", "get_leads", { limit: 200 })
    const leads: LeadRow[] = Array.isArray(res?.data) ? res.data : []
    const unassigned = leads.filter((l) => !l.assigned_to)
    const take = unassigned.slice(0, Math.max(1, count))
    for (const lead of take) {
      await engine("sales-engine", "assign_lead", {
        lead_id: lead.id,
        user_id: user.id,
      })
    }
    return take.length
  }

  async function runFullOnboarding() {
    if (!selectedUser) { setStatus("select_user_required"); return }
    try {
      setBusy(true)
      setStatus("running_onboarding")
      await sendWelcomeAndTraining(selectedUser)
      await createDayOneTasks(selectedUser)
      const assignedCount = await assignStarterLeads(selectedUser, starterLeadCount)
      setStatus(`onboarding_complete_assigned_${assignedCount}_leads`)
    } catch (err) {
      console.error(err)
      setStatus("onboarding_failed")
    } finally {
      setBusy(false)
    }
  }

  async function markFirstCallComplete() {
    if (!selectedUser) { setStatus("select_user_required"); return }
    try {
      setBusy(true)
      await engine("core-automation-engine", "create_task", {
        user_id: selectedUser.id,
        title: "First call completed (milestone logged)",
        priority: "medium",
        category: "onboarding_milestone",
        metadata: {
          milestone: "first_call_completed",
          completed_at: new Date().toISOString(),
        },
      })
      setStatus("first_call_milestone_logged")
    } catch (err) {
      console.error(err)
      setStatus("first_call_log_failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">FULL ONBOARDING SYSTEM</h1>
        <p className="text-zinc-400">
          Day-1 automation: training email, tasks, lead assignment, first-call milestone.
        </p>
      </div>

      <div className="bg-zinc-900 p-4 rounded-xl space-y-3">
        <label className="block text-sm text-zinc-400">Select Contractor</label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="bg-zinc-800 p-2 rounded w-full"
        >
          <option value="">-- choose contractor --</option>
          {contractors.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email ?? "no-email"})
            </option>
          ))}
        </select>

        <label className="block text-sm text-zinc-400">Starter Leads to Assign</label>
        <input
          type="number"
          min={1}
          value={starterLeadCount}
          onChange={(e) => setStarterLeadCount(Number(e.target.value || 1))}
          className="bg-zinc-800 p-2 rounded w-full"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={runFullOnboarding}
          disabled={busy}
          className="bg-purple-600 px-4 py-2 rounded disabled:opacity-50"
        >
          {busy ? "Running..." : "Run Full Onboarding"}
        </button>
        <button
          onClick={markFirstCallComplete}
          disabled={busy}
          className="bg-emerald-600 px-4 py-2 rounded disabled:opacity-50"
        >
          Log First Call Complete
        </button>
        <button
          onClick={refreshUsers}
          disabled={busy}
          className="bg-zinc-700 px-4 py-2 rounded disabled:opacity-50"
        >
          Refresh Contractors
        </button>
      </div>

      <p className="text-sm text-zinc-400">Status: {status}</p>
    </div>
  )
}
