"use client";

import { useEffect, useMemo, useState } from "react";
import { engine } from "@/lib/api";

type UserRow = {
  id: string;
  name: string;
  email?: string;
  role: string;
  is_active: boolean;
};

type LeadRow = {
  id: string;
  status?: string;
  assigned_to?: string | null;
  updated_at?: string;
  created_at?: string;
};

type RepStats = {
  user: UserRow;
  assigned: number;
  contacted: number;
  qualified: number;
  won: number;
  conversionRate: number;
  targetMet: boolean;
  needsCoaching: boolean;
};

function getStartOfTodayISO() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

export default function PerformanceModePage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("idle");
  const [todayOnly, setTodayOnly] = useState(true);

  const [dailyCallTarget, setDailyCallTarget] = useState(30);
  const [minConversionPct, setMinConversionPct] = useState(8);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayOnly]);

  async function refreshAll() {
    try {
      setBusy(true);
      setStatus("loading_data");

      const since = getStartOfTodayISO();

      const [usersRes, leadsRes] = await Promise.all([
        engine<UserRow[]>("core-automation-engine", "get_users"),
        engine<LeadRow[]>("sales-engine", "get_leads", {
          limit: 1000,
          ...(todayOnly ? { updated_after: since } : {}),
        }),
      ]);

      setUsers(Array.isArray(usersRes?.data) ? usersRes.data : []);
      setLeads(Array.isArray(leadsRes?.data) ? leadsRes.data : []);
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setUsers([]);
      setLeads([]);
      setStatus("load_failed");
    } finally {
      setBusy(false);
    }
  }

  const reps = useMemo(
    () =>
      users.filter(
        (u) =>
          u.is_active &&
          ["bge_contractor", "contractor", "sales_rep", "bge"].includes(u.role)
      ),
    [users]
  );

  const stats = useMemo<RepStats[]>(() => {
    const startOfToday = new Date(getStartOfTodayISO());

    return reps.map((rep) => {
      const repLeads = leads.filter((l) => {
        if (l.assigned_to !== rep.id) return false;
        if (!todayOnly) return true;

        const ts = l.updated_at || l.created_at;
        if (!ts) return false;

        return new Date(ts) >= startOfToday;
      });

      const contacted = repLeads.filter((l) =>
        ["contacted", "qualified", "closed_won", "closed_lost"].includes(
          (l.status || "").toLowerCase()
        )
      ).length;

      const qualified = repLeads.filter(
        (l) => (l.status || "").toLowerCase() === "qualified"
      ).length;

      const won = repLeads.filter(
        (l) => (l.status || "").toLowerCase() === "closed_won"
      ).length;

      const conversionRate =
        contacted > 0 ? Number(((won / contacted) * 100).toFixed(1)) : 0;

      const targetMet = contacted >= dailyCallTarget;
      const needsCoaching =
        !targetMet || conversionRate < Number(minConversionPct);

      return {
        user: rep,
        assigned: repLeads.length,
        contacted,
        qualified,
        won,
        conversionRate,
        targetMet,
        needsCoaching,
      };
    });
  }, [reps, leads, todayOnly, dailyCallTarget, minConversionPct]);

  const summary = useMemo(() => {
    const totalReps = stats.length;
    const targetMetCount = stats.filter((s) => s.targetMet).length;
    const coachingCount = stats.filter((s) => s.needsCoaching).length;

    return { totalReps, targetMetCount, coachingCount };
  }, [stats]);

  async function flagLowPerformersForCoaching() {
    try {
      setBusy(true);
      setStatus("flagging_low_performers");

      const lowPerformers = stats.filter((s) => s.needsCoaching);

      for (const rep of lowPerformers) {
        await engine("core-automation-engine", "create_task", {
          user_id: rep.user.id,
          title: "Performance Coaching Required",
          priority: "high",
          category: "coaching",
          metadata: {
            today_only: todayOnly,
            daily_call_target: dailyCallTarget,
            min_conversion_pct: minConversionPct,
            contacted: rep.contacted,
            won: rep.won,
            conversion_rate: rep.conversionRate,
            flagged_at: new Date().toISOString(),
          },
        });
      }

      setStatus(`coaching_flagged_${lowPerformers.length}_users`);
    } catch (err) {
      console.error(err);
      setStatus("flagging_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">PERFORMANCE MODE</h1>
        <p className="text-zinc-400">
          Daily call target tracking, conversion scoreboard, and coaching flags.
        </p>
      </div>

      <div className="bg-zinc-900 p-4 rounded-xl space-y-2">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={todayOnly}
            onChange={(e) => setTodayOnly(e.target.checked)}
          />
          Today only metrics
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 p-4 rounded-xl space-y-2">
          <label className="block text-sm text-zinc-400">
            Daily Call Target (contacted leads)
          </label>
          <input
            type="number"
            min={1}
            value={dailyCallTarget}
            onChange={(e) => setDailyCallTarget(Number(e.target.value || 1))}
            className="bg-zinc-800 p-2 rounded w-full"
          />
        </div>

        <div className="bg-zinc-900 p-4 rounded-xl space-y-2">
          <label className="block text-sm text-zinc-400">
            Minimum Conversion % (won/contacted)
          </label>
          <input
            type="number"
            min={0}
            value={minConversionPct}
            onChange={(e) => setMinConversionPct(Number(e.target.value || 0))}
            className="bg-zinc-800 p-2 rounded w-full"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={refreshAll}
          disabled={busy}
          className="bg-zinc-700 px-4 py-2 rounded disabled:opacity-50"
        >
          {busy ? "Loading..." : "Refresh Metrics"}
        </button>

        <button
          onClick={flagLowPerformersForCoaching}
          disabled={busy}
          className="bg-amber-600 px-4 py-2 rounded disabled:opacity-50"
        >
          Flag Low Performers for Coaching
        </button>
      </div>

      <div className="bg-zinc-900 p-4 rounded-xl">
        <p className="text-sm text-zinc-300">
          Active reps: <span className="font-semibold">{summary.totalReps}</span>
        </p>
        <p className="text-sm text-zinc-300">
          Target met:{" "}
          <span className="font-semibold">{summary.targetMetCount}</span>
        </p>
        <p className="text-sm text-zinc-300">
          Needs coaching:{" "}
          <span className="font-semibold">{summary.coachingCount}</span>
        </p>
      </div>

      <div className="space-y-3">
        {stats.map((s) => (
          <div
            key={s.user.id}
            className="bg-zinc-900 p-4 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div>
              <p className="font-semibold">{s.user.name}</p>
              <p className="text-xs text-zinc-400">{s.user.email || "no-email"}</p>
            </div>

            <div className="text-sm text-zinc-300 flex flex-wrap gap-3">
              <span>Assigned: {s.assigned}</span>
              <span>Contacted: {s.contacted}</span>
              <span>Qualified: {s.qualified}</span>
              <span>Won: {s.won}</span>
              <span>Conv: {s.conversionRate}%</span>
            </div>

            <div className="flex gap-2">
              <span
                className={`text-xs px-2 py-1 rounded ${
                  s.targetMet ? "bg-emerald-700" : "bg-zinc-700"
                }`}
              >
                {s.targetMet ? "Target Met" : "Target Missed"}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  s.needsCoaching ? "bg-amber-700" : "bg-emerald-700"
                }`}
              >
                {s.needsCoaching ? "Coaching Needed" : "Healthy"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-zinc-400">Status: {status}</p>
    </div>
  );
}