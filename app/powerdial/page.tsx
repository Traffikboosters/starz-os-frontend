"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"

// ===== CONFIG =====
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(SB_URL, SB_KEY)

const DIALPAD_USER_ID = "4566842998267904"
const EDGE_FN = `${SB_URL}/functions/v1/dialpad-call`
const ENGINE_URL = `${SB_URL}/functions/v1/core-automation-engine`

// ===== TYPES =====
type QueueLead = {
  id: string
  lead_id: string
  name: string
  phone: string
  status: string
  priority: number
  attempts: number
  last_call_at: string | null
  last_called_at: string | null
  call_attempts: number
  assigned_bge: string | null
  dialpad_contact_id: string | null
}

type ActiveCall = {
  id: string
  dialpad_call_id: string | null
  phone_number: string
  phone: string
  call_status: string
  started_at: string | null
  ai_tip: string | null
  objection: string | null
  sentiment: string | null
  deal_heat_score: number | null
  detected_buying_signal: boolean | null
  proposal_ready: boolean | null
  lead_id: string | null
}

type Disposition = "interested" | "callback" | "not_interested" | "voicemail" | "no_answer" | "connected"

type CallState = "idle" | "dialing" | "connected" | "ended"

// ===== HELPERS =====
function formatPhone(p: string) {
  const d = p.replace(/\D/g, "")
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  if (d.length === 11) return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  return p
}

function toE164(p: string) {
  const d = p.replace(/\D/g, "")
  return d.length === 10 ? `+1${d}` : `+${d}`
}

function formatTimer(s: number) {
  const m = Math.floor(s / 60)
  const sec = String(s % 60).padStart(2, "0")
  return `${m}:${sec}`
}

function timeAgo(ts: string | null) {
  if (!ts) return "—"
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ===== MAIN COMPONENT =====
export default function PowerDialPage() {
  const [queue, setQueue] = useState<QueueLead[]>([])
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([])
  const [currentLead, setCurrentLead] = useState<QueueLead | null>(null)
  const [callState, setCallState] = useState<CallState>("idle")
  const [activeCallRecord, setActiveCallRecord] = useState<ActiveCall | null>(null)
  const [timer, setTimer] = useState(0)
  const [notes, setNotes] = useState("")
  const [isAutoDialing, setIsAutoDialing] = useState(false)
  const [manualPhone, setManualPhone] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "green" | "red" | "amber" } | null>(null)
  const [tab, setTab] = useState<"queue" | "active" | "history">("queue")
  const [transferTarget, setTransferTarget] = useState("")
  const [showTransfer, setShowTransfer] = useState(false)
  const [showConference, setShowConference] = useState(false)
  const [conferenceNumber, setConferenceNumber] = useState("")
  const [loading, setLoading] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoDialRef = useRef(false)

  // ===== TOAST =====
  function showToast(msg: string, type: "green" | "red" | "amber" = "green") {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ===== LOAD QUEUE =====
  const loadQueue = useCallback(async () => {
    const { data, error } = await supabase
      .schema("dialer")
      .from("call_queue")
      .select("id,lead_id,name,phone,status,priority,attempts,last_called_at,last_call_at,call_attempts,assigned_bge,dialpad_contact_id")
      .order("priority", { ascending: false })
      .limit(100)
    if (data) setQueue(data as QueueLead[])
    if (error) console.error("Queue load error:", error)
  }, [])

  // ===== LOAD ACTIVE CALLS =====
  const loadActiveCalls = useCallback(async () => {
    const { data } = await supabase
      .schema("dialer")
      .from("calls")
      .select("id,dialpad_call_id,phone_number,phone,call_status,started_at,ai_tip,objection,sentiment,deal_heat_score,detected_buying_signal,proposal_ready,lead_id")
      .in("call_status", ["active", "connected", "dialing"])
      .order("created_at", { ascending: false })
      .limit(20)
    if (data) setActiveCalls(data as ActiveCall[])
  }, [])

  // ===== TIMER =====
  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimer(0)
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
  }

  // ===== DIAL LEAD =====
  async function dialLead(lead: QueueLead) {
    const e164 = toE164(lead.phone || "")
    if (!e164 || e164.length < 10) {
      showToast("⚠ No valid phone number", "amber")
      return
    }

    setCurrentLead(lead)
    setCallState("dialing")
    startTimer()
    showToast(`📞 Dialing ${formatPhone(lead.phone || "")}…`, "green")
    setLoading(true)

    try {
      const res = await fetch(EDGE_FN, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SB_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "initiate_call",
          user_id: DIALPAD_USER_ID,
          phone_number: e164,
        }),
      })

      const data = await res.json()

      if (data?.error) {
        showToast(`✗ Dialpad error: ${data.error}`, "red")
        setCallState("idle")
        stopTimer()
        return
      }

      // Log call to dialer.calls
      const { data: callRow } = await supabase
        .schema("dialer")
        .from("calls")
        .insert({
          lead_id: lead.lead_id || lead.id,
          phone: e164,
          phone_number: e164,
          call_status: "dialing",
          dialpad_user_id: DIALPAD_USER_ID,
          direction: "outbound",
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (callRow) setActiveCallRecord(callRow as ActiveCall)

      // Update queue lead status
      await supabase
        .schema("dialer")
        .from("call_queue")
        .update({
          status: "calling",
          last_call_at: new Date().toISOString(),
          call_attempts: (lead.call_attempts || 0) + 1,
        })
        .eq("id", lead.id)

      setCallState("connected")
      showToast(`✓ Connected: ${lead.name}`, "green")
      loadQueue()

    } catch (err) {
      showToast(`✗ Failed: ${String(err)}`, "red")
      setCallState("idle")
      stopTimer()
    } finally {
      setLoading(false)
    }
  }

  // ===== MANUAL DIAL =====
  async function manualDial() {
    if (!manualPhone.trim()) return
    const fakeLeadRow: QueueLead = {
      id: "manual",
      lead_id: "manual",
      name: manualPhone,
      phone: manualPhone,
      status: "manual",
      priority: 0,
      attempts: 0,
      last_call_at: null,
      last_called_at: null,
      call_attempts: 0,
      assigned_bge: null,
      dialpad_contact_id: null,
    }
    setManualPhone("")
    await dialLead(fakeLeadRow)
  }

  // ===== END CALL =====
  async function endCall(disposition: Disposition) {
    stopTimer()
    setCallState("ended")
    showToast(`Call ended — ${disposition}`, disposition === "interested" ? "green" : "amber")

    // Update call record
    if (activeCallRecord?.id) {
      await supabase
        .schema("dialer")
        .from("calls")
        .update({
          call_status: "ended",
          ended_at: new Date().toISOString(),
          duration: timer,
          sentiment: disposition === "interested" ? "positive" : disposition === "not_interested" ? "negative" : "neutral",
        })
        .eq("id", activeCallRecord.id)
    }

    // Update queue status
    if (currentLead?.id) {
      await supabase
        .schema("dialer")
        .from("call_queue")
        .update({ status: disposition === "not_interested" ? "dnc" : disposition === "callback" ? "callback" : "called" })
        .eq("id", currentLead.id)
    }

    // Log to call_actions
    if (activeCallRecord?.id) {
      await supabase
        .from("call_actions")
        .insert({
          call_id: activeCallRecord.id,
          action: "disposition",
          notes: `${disposition} — ${notes}`,
          metadata: { disposition, duration: timer, notes },
        })
    }

    setNotes("")
    setActiveCallRecord(null)
    loadQueue()

    setTimeout(() => {
      setCurrentLead(null)
      setCallState("idle")
      if (autoDialRef.current) autoDialNext()
    }, 1200)
  }

  // ===== AUTO DIAL NEXT =====
  async function autoDialNext() {
    const { data } = await supabase
      .schema("dialer")
      .from("call_queue")
      .select("id,lead_id,name,phone,status,priority,attempts,last_called_at,last_call_at,call_attempts,assigned_bge,dialpad_contact_id")
      .eq("status", "ready")
      .order("priority", { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setTimeout(() => dialLead(data as QueueLead), 2000)
    } else {
      showToast("✓ Queue complete!", "green")
      setIsAutoDialing(false)
      autoDialRef.current = false
    }
  }

  // ===== TRANSFER CALL =====
  async function transferCall() {
    if (!transferTarget || !activeCallRecord?.dialpad_call_id) {
      showToast("Need an active Dialpad call ID to transfer", "amber")
      return
    }

    showToast(`↗ Transferring to ${transferTarget}…`, "amber")

    const res = await fetch(EDGE_FN, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "transfer_call",
        call_id: activeCallRecord.dialpad_call_id,
        to_number: toE164(transferTarget),
      }),
    })

    const data = await res.json()
    if (data?.error) {
      showToast(`✗ Transfer failed: ${data.error}`, "red")
    } else {
      showToast("✓ Call transferred!", "green")
      setShowTransfer(false)
      endCall("connected")
    }
  }

  // ===== CONFERENCE =====
  async function startConference() {
    if (!conferenceNumber) return
    showToast(`📞 Adding ${formatPhone(conferenceNumber)} to call…`, "amber")

    await fetch(EDGE_FN, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "initiate_call",
        user_id: DIALPAD_USER_ID,
        phone_number: toE164(conferenceNumber),
      }),
    })

    showToast("✓ 3rd party dialed — merge in Dialpad app", "green")
    setShowConference(false)
    setConferenceNumber("")
  }

  // ===== VIDEO SESSION =====
  async function startVideoSession() {
    if (!currentLead) return
    showToast("🎥 Creating video session…", "amber")

    const { data } = await supabase
      .from("video_sessions")
      .insert({
        lead_id: currentLead.lead_id || currentLead.id,
        provider: "dialpad",
        status: "scheduled",
        scheduled_for: new Date().toISOString(),
      })
      .select()
      .single()

    if (data?.join_url) {
      window.open(data.join_url, "_blank")
      showToast("✓ Video session started!", "green")
    } else {
      showToast("Video session created — check Dialpad for join link", "amber")
    }
  }

  // ===== DISPOSITION BUTTON =====
  async function setDisposition(leadId: string, disposition: string) {
    await supabase
      .schema("dialer")
      .from("call_queue")
      .update({ status: disposition })
      .eq("id", leadId)
    showToast(`✓ Marked as ${disposition}`, "green")
    loadQueue()
  }

  // ===== REALTIME =====
  useEffect(() => {
    loadQueue()
    loadActiveCalls()

    const channel = supabase
      .channel("powerdial_floor")
      .on("postgres_changes", {
        event: "*",
        schema: "dialer",
        table: "calls",
      }, () => {
        loadActiveCalls()
      })
      .on("postgres_changes", {
        event: "*",
        schema: "dialer",
        table: "call_queue",
      }, () => {
        loadQueue()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      stopTimer()
    }
  }, [loadQueue, loadActiveCalls])

  // ===== SENTIMENT COLOR =====
  function sentimentColor(s: string | null) {
    if (!s) return "text-slate-400"
    if (s === "positive") return "text-green-400"
    if (s === "negative") return "text-red-400"
    return "text-amber-400"
  }

  const readyCount = queue.filter(q => q.status === "ready").length
  const callingCount = queue.filter(q => q.status === "calling").length

  // ===== RENDER =====
  return (
    <div className="min-h-screen bg-[#080B14] text-white font-sans overflow-hidden">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-2xl border transition-all
          ${toast.type === "green" ? "bg-green-500/20 border-green-500/40 text-green-300" :
            toast.type === "red" ? "bg-red-500/20 border-red-500/40 text-red-300" :
            "bg-amber-500/20 border-amber-500/40 text-amber-300"}`}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-white/5 bg-black/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-sm">⚡</div>
          <span className="font-bold text-sm tracking-wider">POWERDIAL</span>
          <span className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-1.5 py-0.5 ml-1">CALL CENTER</span>
        </div>

        <div className="flex items-center gap-3 ml-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
            <span className="text-slate-400">Ready: <strong className="text-white">{readyCount}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
            <span className="text-slate-400">Active: <strong className="text-white">{callingCount}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            <span className="text-slate-400">Queue: <strong className="text-white">{queue.length}</strong></span>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* AUTO DIAL TOGGLE */}
          <button
            onClick={() => {
              const next = !isAutoDialing
              setIsAutoDialing(next)
              autoDialRef.current = next
              if (next && callState === "idle") autoDialNext()
              showToast(next ? "▶ Auto-dial ON" : "⏹ Auto-dial OFF", next ? "green" : "amber")
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
              ${isAutoDialing
                ? "bg-green-500/20 border-green-500/40 text-green-300 hover:bg-green-500/30"
                : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"}`}>
            {isAutoDialing ? "⏹ Stop Auto-Dial" : "▶ Start Auto-Dial"}
          </button>

          <button
            onClick={() => { loadQueue(); loadActiveCalls() }}
            className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-all">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-12 gap-0 h-[calc(100vh-52px)]">

        {/* LEFT: LEAD QUEUE */}
        <div className="col-span-4 border-r border-white/5 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-white/5">
            {(["queue", "active", "history"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all
                  ${tab === t ? "text-orange-400 border-b-2 border-orange-500" : "text-slate-500 hover:text-slate-300"}`}>
                {t === "queue" ? `Queue (${queue.length})` : t === "active" ? `Live (${activeCalls.length})` : "History"}
              </button>
            ))}
          </div>

          {/* Manual dial bar */}
          <div className="flex gap-2 p-3 border-b border-white/5">
            <input
              value={manualPhone}
              onChange={e => setManualPhone(e.target.value)}
              onKeyDown={e => e.key === "Enter" && manualDial()}
              placeholder="Enter number to dial…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-orange-500/50"
            />
            <button
              onClick={manualDial}
              disabled={!manualPhone || loading}
              className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-semibold hover:bg-green-500/30 disabled:opacity-40 transition-all">
              📞 Dial
            </button>
          </div>

          {/* Queue List */}
          <div className="flex-1 overflow-y-auto">
            {tab === "queue" && queue.map((lead, i) => (
              <div key={lead.id}
                className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition-all group
                  ${currentLead?.id === lead.id ? "bg-orange-500/10 border-l-2 border-l-orange-500" : ""}`}>

                <span className="text-[10px] text-slate-600 w-5 text-center">{i + 1}</span>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{lead.name || "Unknown"}</div>
                  <div className="text-[10px] text-slate-500">{formatPhone(lead.phone || "")}</div>
                </div>

                <div className="flex flex-col items-end gap-0.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold
                    ${lead.status === "ready" ? "bg-green-500/20 text-green-400" :
                      lead.status === "calling" ? "bg-orange-500/20 text-orange-400" :
                      lead.status === "callback" ? "bg-blue-500/20 text-blue-400" :
                      "bg-slate-700 text-slate-400"}`}>
                    {(lead.status || "ready").toUpperCase()}
                  </span>
                  <span className="text-[9px] text-slate-600">{timeAgo(lead.last_call_at || lead.last_called_at)}</span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => dialLead(lead)}
                    disabled={callState !== "idle" || loading}
                    className="p-1 rounded bg-green-500/20 text-green-300 text-[9px] hover:bg-green-500/30 disabled:opacity-30 transition-all">
                    📞
                  </button>
                  <button
                    onClick={() => setDisposition(lead.id, "interested")}
                    className="p-1 rounded bg-cyan-500/20 text-cyan-300 text-[9px] hover:bg-cyan-500/30 transition-all">
                    🔥
                  </button>
                  <button
                    onClick={() => setDisposition(lead.id, "callback")}
                    className="p-1 rounded bg-amber-500/20 text-amber-300 text-[9px] hover:bg-amber-500/30 transition-all">
                    📅
                  </button>
                  <button
                    onClick={() => setDisposition(lead.id, "dnc")}
                    className="p-1 rounded bg-red-500/20 text-red-300 text-[9px] hover:bg-red-500/30 transition-all">
                    ✕
                  </button>
                </div>
              </div>
            ))}

            {tab === "active" && activeCalls.map(call => (
              <div key={call.id} className="p-3 border-b border-white/[0.04]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="text-xs font-semibold">{formatPhone(call.phone || call.phone_number || "")}</span>
                  <span className="text-[9px] text-green-400 ml-auto">{call.call_status}</span>
                </div>
                {call.ai_tip && (
                  <div className="text-[10px] text-orange-300 bg-orange-500/10 rounded px-2 py-1 mt-1">
                    💡 {call.ai_tip}
                  </div>
                )}
                {call.sentiment && (
                  <div className={`text-[10px] mt-1 ${sentimentColor(call.sentiment)}`}>
                    Sentiment: {call.sentiment}
                  </div>
                )}
              </div>
            ))}

            {tab === "history" && (
              <div className="p-4 text-center text-slate-600 text-xs">
                View call history in the Calls dashboard
              </div>
            )}
          </div>
        </div>

        {/* CENTER: ACTIVE CALL HUD */}
        <div className="col-span-5 flex flex-col border-r border-white/5">

          {callState === "idle" && !currentLead && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-6xl mb-4">📞</div>
                <div className="text-xl font-bold text-slate-300 mb-2">PowerDial Ready</div>
                <div className="text-sm text-slate-600 mb-6">{readyCount} leads in queue</div>
                <button
                  onClick={() => {
                    setIsAutoDialing(true)
                    autoDialRef.current = true
                    autoDialNext()
                  }}
                  disabled={readyCount === 0}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-sm hover:from-orange-400 hover:to-red-400 disabled:opacity-40 transition-all shadow-lg shadow-orange-500/25">
                  ▶ Start Auto-Dial Session
                </button>
              </div>

              {activeCalls.length > 0 && (
                <div className="text-xs text-slate-500">
                  {activeCalls.length} call(s) currently active in Dialpad
                </div>
              )}
            </div>
          )}

          {(callState === "dialing" || callState === "connected") && currentLead && (
            <div className="flex-1 flex flex-col">

              {/* Call Status Bar */}
              <div className={`px-6 py-3 flex items-center gap-3 border-b border-white/5
                ${callState === "dialing" ? "bg-amber-500/5" : "bg-green-500/5"}`}>
                <span className={`w-2.5 h-2.5 rounded-full animate-pulse
                  ${callState === "dialing" ? "bg-amber-400" : "bg-green-400"}`}></span>
                <span className="text-sm font-semibold">
                  {callState === "dialing" ? "Dialing…" : "Connected"}
                </span>
                <span className="ml-auto font-mono text-2xl font-bold text-white">
                  {formatTimer(timer)}
                </span>
              </div>

              {/* Lead Info */}
              <div className="px-6 py-5 border-b border-white/5">
                <div className="text-2xl font-bold mb-0.5">{currentLead.name}</div>
                <div className="text-lg text-slate-400 font-mono">{formatPhone(currentLead.phone)}</div>
                {activeCallRecord?.ai_tip && (
                  <div className="mt-3 text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                    💡 Steve: {activeCallRecord.ai_tip}
                  </div>
                )}
                {activeCallRecord?.objection && (
                  <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    ⚠ Objection: {activeCallRecord.objection}
                  </div>
                )}
                {activeCallRecord?.detected_buying_signal && (
                  <div className="mt-2 text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 animate-pulse">
                    🔥 BUYING SIGNAL DETECTED — Push close now!
                  </div>
                )}
              </div>

              {/* Primary Disposition Buttons */}
              <div className="px-6 py-4 border-b border-white/5">
                <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-3">Disposition</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "🔥 Interested", value: "interested" as Disposition, color: "green" },
                    { label: "📅 Callback", value: "callback" as Disposition, color: "blue" },
                    { label: "✗ Not Interested", value: "not_interested" as Disposition, color: "red" },
                    { label: "📬 Voicemail", value: "voicemail" as Disposition, color: "purple" },
                    { label: "📵 No Answer", value: "no_answer" as Disposition, color: "amber" },
                    { label: "✓ Connected", value: "connected" as Disposition, color: "cyan" },
                  ].map(btn => (
                    <button key={btn.value}
                      onClick={() => endCall(btn.value)}
                      className={`py-2 px-3 rounded-lg text-[11px] font-semibold transition-all border
                        ${btn.color === "green" ? "bg-green-500/15 border-green-500/30 text-green-300 hover:bg-green-500/25" :
                          btn.color === "red" ? "bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25" :
                          btn.color === "blue" ? "bg-blue-500/15 border-blue-500/30 text-blue-300 hover:bg-blue-500/25" :
                          btn.color === "amber" ? "bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25" :
                          btn.color === "purple" ? "bg-purple-500/15 border-purple-500/30 text-purple-300 hover:bg-purple-500/25" :
                          "bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25"}`}>
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Call Controls */}
              <div className="px-6 py-4 border-b border-white/5">
                <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-3">Call Controls</div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setShowTransfer(!showTransfer)}
                    className="px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all">
                    ↗ Transfer
                  </button>
                  <button
                    onClick={() => setShowConference(!showConference)}
                    className="px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all">
                    👥 Conference
                  </button>
                  <button
                    onClick={startVideoSession}
                    className="px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all">
                    🎥 Video
                  </button>
                  <button
                    onClick={() => endCall("no_answer")}
                    className="px-3 py-2 rounded-lg text-xs bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-all ml-auto">
                    🔴 End Call
                  </button>
                </div>

                {/* Transfer Panel */}
                {showTransfer && (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={transferTarget}
                      onChange={e => setTransferTarget(e.target.value)}
                      placeholder="Transfer to number or ext…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-orange-500/50"
                    />
                    <button
                      onClick={transferCall}
                      className="px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-semibold hover:bg-orange-500/30 transition-all">
                      Transfer
                    </button>
                  </div>
                )}

                {/* Conference Panel */}
                {showConference && (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={conferenceNumber}
                      onChange={e => setConferenceNumber(e.target.value)}
                      placeholder="Add number to conference…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-orange-500/50"
                    />
                    <button
                      onClick={startConference}
                      className="px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold hover:bg-blue-500/30 transition-all">
                      Add
                    </button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="flex-1 px-6 py-4">
                <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Call Notes</div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Type notes during call…"
                  className="w-full h-full min-h-[80px] bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-700 outline-none focus:border-orange-500/30 resize-none"
                />
              </div>
            </div>
          )}

          {callState === "ended" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">✓</div>
              <div className="text-sm font-semibold text-slate-300">Call logged</div>
              <div className="text-xs text-slate-600">Duration: {formatTimer(timer)}</div>
              {isAutoDialing && (
                <div className="text-xs text-orange-400 animate-pulse">Next call in 2s…</div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: AI ASSIST + STATS */}
        <div className="col-span-3 flex flex-col overflow-y-auto">

          {/* Steve AI Panel */}
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-[10px]">S</div>
              <span className="text-xs font-semibold">Steve BGE — AI Assist</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 ml-auto"></span>
            </div>

            {currentLead && callState === "connected" ? (
              <div className="space-y-2">
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-[11px] text-purple-200">
                  💡 <strong>Opening:</strong> "Hey {currentLead.name?.split(" ")[0]}, I noticed your business has room to grow online — I wanted to reach out directly."
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-[11px] text-blue-200">
                  🎯 <strong>Pitch:</strong> Focus on ROI and measurable results. Push for discovery call or proposal within 3 min.
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-[11px] text-orange-200">
                  ⚡ <strong>Close:</strong> "If I could show you 5 new clients in 30 days, would you want to see how?"
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-600 italic">
                Steve suggestions appear when a call is active
              </div>
            )}
          </div>

          {/* Deal Heat */}
          {activeCallRecord?.deal_heat_score != null && (
            <div className="p-4 border-b border-white/5">
              <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Deal Heat</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all"
                    style={{ width: `${activeCallRecord.deal_heat_score}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-orange-400">{activeCallRecord.deal_heat_score}</span>
              </div>
            </div>
          )}

          {/* Session Stats */}
          <div className="p-4 border-b border-white/5">
            <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-3">Session</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Queue", value: queue.length },
                { label: "Ready", value: readyCount },
                { label: "Active", value: callingCount },
                { label: "Call Time", value: formatTimer(timer) },
              ].map(stat => (
                <div key={stat.label} className="bg-white/[0.03] rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-white">{stat.value}</div>
                  <div className="text-[9px] text-slate-600 uppercase">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Objection Playbook */}
          <div className="p-4 border-b border-white/5">
            <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-3">Objection Rebuttals</div>
            <div className="space-y-2">
              {[
                { obj: "Too expensive", rebuttal: "What's the cost of NOT getting new clients?" },
                { obj: "Not interested", rebuttal: "Totally get it — what's your current plan for growth?" },
                { obj: "Already have someone", rebuttal: "Are they getting you results? I can show benchmarks." },
                { obj: "Call me later", rebuttal: "I have one slot left this week — what works for you?" },
              ].map(item => (
                <div key={item.obj} className="text-[10px]">
                  <div className="text-red-400 font-semibold">"{item.obj}"</div>
                  <div className="text-slate-400 ml-2">→ {item.rebuttal}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Video Session Quick Launch */}
          <div className="p-4">
            <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-3">Quick Actions</div>
            <div className="space-y-2">
              <button
                onClick={startVideoSession}
                disabled={!currentLead}
                className="w-full py-2 rounded-lg text-xs bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 disabled:opacity-30 transition-all">
                🎥 Start Video Session
              </button>
              <button
                onClick={() => window.open("https://dialpad.com", "_blank")}
                className="w-full py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-all">
                ↗ Open Dialpad App
              </button>
              <button
                onClick={loadQueue}
                className="w-full py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-all">
                ↻ Reload Queue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
