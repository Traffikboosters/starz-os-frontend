'use client';

import { useRicoData } from '@/hooks/useRicoData';
import { RicoChat } from '@/components/rico-chat';
import {
  ClipboardList,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type WorkOrderStatus = 'active' | 'probation' | 'completed' | 'paused';
type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed';

// ── Style maps ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<WorkOrderStatus | string, string> = {
  probation: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  active:    'text-green-400  bg-green-400/10  border-green-400/20',
  completed: 'text-blue-400   bg-blue-400/10   border-blue-400/20',
  paused:    'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

const STAGE_COLORS: Record<DealStage | string, string> = {
  lead:        'text-white/50   bg-white/5       border-white/10',
  qualified:   'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
  proposal:    'text-purple-400 bg-purple-400/10 border-purple-400/20',
  negotiation: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  closed:      'text-green-400  bg-green-400/10  border-green-400/20',
};

const FALLBACK = 'text-white/50 bg-white/5 border-white/10';

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 text-xs px-2 py-0.5 rounded-full border capitalize ${
        STATUS_COLORS[status] ?? FALLBACK
      }`}
    >
      {status}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      className={`shrink-0 text-xs px-2 py-0.5 rounded-full border capitalize ${
        STAGE_COLORS[stage] ?? FALLBACK
      }`}
    >
      {stage}
    </span>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-12 text-center text-white/30 text-sm">{label}</div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-white/40">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading...
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RicoPage() {
  const { workOrders, deals, loading, error } = useRicoData();

  const activeOrders    = workOrders.filter((w) => w.status === 'active').length;
  const probationOrders = workOrders.filter((w) => w.status === 'probation').length;
  const openDeals       = deals.filter((d) => d.stage !== 'closed').length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-cyan-500/50 shrink-0">
            <img
              src="/rico-avatar.png"
              alt="Rico"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Rico Dashboard</h1>
            <p className="text-sm text-cyan-400">
              Technical Supervisor BGE — Fulfillment Operations
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/60">Active Work Orders</span>
            <CheckCircle className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-3xl font-bold">
            {loading ? '—' : activeOrders}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/60">In Probation</span>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-3xl font-bold">
            {loading ? '—' : probationOrders}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/60">Open Deals</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold">
            {loading ? '—' : openDeals}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Work Orders */}
        <div className="rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center gap-2 p-5 border-b border-white/10">
            <ClipboardList className="w-4 h-4 text-cyan-400" />
            <h2 className="font-semibold">Work Orders</h2>
            <span className="ml-auto text-xs text-white/40">
              {workOrders.length} total
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {loading ? (
              <LoadingState />
            ) : workOrders.length === 0 ? (
              <EmptyState label="No work orders found" />
            ) : (
              workOrders.map((wo) => (
                <div
                  key={wo.id}
                  className="flex items-start justify-between gap-3 px-5 py-4 hover:bg-white/5 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {wo.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {wo.assigned_to
                        ? `Assigned to ${wo.assigned_to}`
                        : 'Unassigned'}{' '}
                      · {formatDate(wo.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={wo.status} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Deals Pipeline */}
        <div className="rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center gap-2 p-5 border-b border-white/10">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h2 className="font-semibold">Deals Pipeline</h2>
            <span className="ml-auto text-xs text-white/40">
              {deals.length} total
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {loading ? (
              <LoadingState />
            ) : deals.length === 0 ? (
              <EmptyState label="No deals found" />
            ) : (
              deals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-start justify-between gap-3 px-5 py-4 hover:bg-white/5 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {deal.company_name || 'Unknown Company'}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {deal.contact_name || 'No contact'} ·{' '}
                      {formatDate(deal.created_at)}
                    </p>
                    {deal.services && deal.services.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {deal.services.map((s: string) => (
                          <span
                            key={s}
                            className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/50"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <StageBadge stage={deal.stage} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Rico chat widget */}
      <RicoChat />
    </div>
  );
}
