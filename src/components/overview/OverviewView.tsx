import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap
} from 'lucide-react';
import React from 'react';
import { Cluster, Incident, OverviewMetrics } from '../../types/index';
import { ClusterStatusBadge, SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, EmptyState } from '../common/UI';

interface OverviewViewProps {
  metrics: OverviewMetrics | null;
  clusters: Cluster[];
  recentIncidents: Incident[];
  recentActivity: Array<{
    id: string;
    type: string;
    timestamp: number;
    title: string;
    description: string;
    incidentId?: string;
    clusterId?: string;
  }>;
  onSelectIncident: (id: string) => void;
  onSelectCluster: (id: string) => void;
  onOpenAddCluster: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  metrics,
  clusters,
  recentIncidents,
  recentActivity,
  onSelectIncident,
  onSelectCluster,
  onOpenAddCluster,
  onRefresh,
  loading
}) => {
  const formatTimeAgo = (ts?: number) => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2.5">
            Operational Overview
          </h1>
          <p className="text-xs font-mono text-zinc-400 mt-1">
            Real-time status across all registered Kubernetes clusters and active incidents
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={onOpenAddCluster} icon={<Plus className="w-3.5 h-3.5" />}>
            Connect Cluster
          </Button>
        </div>
      </div>

      {/* Prominent Empty State Banner if NO clusters exist yet */}
      {clusters.length === 0 && (
        <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800/90 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-sky-950/60 border border-sky-800/50 flex items-center justify-center mx-auto text-sky-400">
            <Server className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg font-bold text-zinc-100">No Kubernetes Clusters Connected</h2>
            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              Connect your first cluster to start streaming telemetry and detecting incidents.
            </p>
          </div>
          <div>
            <Button
              variant="primary"
              size="md"
              onClick={onOpenAddCluster}
              icon={<Plus className="w-4 h-4" />}
              className="font-mono text-xs px-6 py-2.5"
            >
              Connect Cluster
            </Button>
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Total Clusters</div>
          <div className="text-2xl font-bold text-zinc-100 font-mono mt-1">{metrics?.totalClusters ?? 0}</div>
          <div className="text-[10px] font-mono text-zinc-500 mt-1">Registered infrastructure</div>
        </div>

        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40">
          <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Healthy
          </div>
          <div className="text-2xl font-bold text-emerald-300 font-mono mt-1">{metrics?.healthyClusters ?? 0}</div>
          <div className="text-[10px] font-mono text-emerald-500 mt-1">Operating normally</div>
        </div>

        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/40">
          <div className="text-[11px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Warning
          </div>
          <div className="text-2xl font-bold text-amber-300 font-mono mt-1">{metrics?.warningClusters ?? 0}</div>
          <div className="text-[10px] font-mono text-amber-500 mt-1">Degraded state</div>
        </div>

        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40">
          <div className="text-[11px] font-mono text-rose-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Critical
          </div>
          <div className="text-2xl font-bold text-rose-300 font-mono mt-1">{metrics?.criticalClusters ?? 0}</div>
          <div className="text-[10px] font-mono text-rose-500 mt-1">Requires intervention</div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Offline Agents</div>
          <div className="text-2xl font-bold text-zinc-300 font-mono mt-1">{metrics?.offlineClusters ?? 0}</div>
          <div className="text-[10px] font-mono text-zinc-500 mt-1">Heartbeat timeout</div>
        </div>

        <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-900/40">
          <div className="text-[11px] font-mono text-purple-400 uppercase tracking-wider">Open Incidents</div>
          <div className="text-2xl font-bold text-purple-300 font-mono mt-1">{metrics?.openIncidents ?? 0}</div>
          <div className="text-[10px] font-mono text-purple-500 mt-1">Active investigations</div>
        </div>
      </div>

      {/* Cluster Health & Recent Incidents Two-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Cluster Status Summary */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-400" />
              Connected Clusters ({clusters.length})
            </h2>
          </div>

          {clusters.length === 0 ? (
            <EmptyState
              title="No Kubernetes clusters connected"
              description="Connect your first cluster to start streaming telemetry and detecting incidents."
              action={{ label: 'Connect Cluster', onClick: onOpenAddCluster }}
            />
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
              <div className="divide-y divide-zinc-800/60">
                {clusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    onClick={() => onSelectCluster(cluster.id)}
                    className="p-4 hover:bg-zinc-800/40 transition-colors cursor-pointer flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-100 font-mono truncate">{cluster.name}</span>
                        {cluster.isSimulated && (
                          <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1 rounded border border-zinc-700">
                            TEST
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
                        <span>K8s {cluster.k8sVersion || 'v1.31'}</span>
                        <span>•</span>
                        <span>{cluster.nodeCount} Nodes</span>
                        <span>•</span>
                        <span>{cluster.podCount} Pods</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <ClusterStatusBadge status={cluster.status} agentStatus={cluster.agentStatus} />
                        <div className="text-[10px] font-mono text-zinc-500 mt-1">
                          Pulse: {formatTimeAgo(cluster.lastHeartbeat)}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Recent Incidents Feed */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Active Incident Tickets ({recentIncidents.length})
            </h2>
          </div>

          {recentIncidents.length === 0 ? (
            <div className="p-8 border border-zinc-800/80 rounded-xl bg-zinc-900/30 text-center">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <div className="text-sm font-semibold text-zinc-200">No active incidents detected</div>
              <div className="text-xs text-zinc-400 mt-1">
                All observed Kubernetes workloads are reporting healthy parameters.
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
              <div className="divide-y divide-zinc-800/60">
                {recentIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => onSelectIncident(inc.id)}
                    className="p-4 hover:bg-zinc-800/40 transition-colors cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-400">{inc.id}</span>
                        <SeverityBadge severity={inc.severity} size="sm" />
                        <StatusBadge status={inc.status} size="sm" />
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        Occurrences: <strong className="text-zinc-300">{inc.occurrenceCount}</strong> •{' '}
                        {formatTimeAgo(inc.lastSeenAt)}
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-zinc-200 truncate">{inc.title}</div>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                      <span className="text-zinc-500">cluster:</span>
                      <span className="text-zinc-300">{inc.clusterName}</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-zinc-500">ns:</span>
                      <span className="text-zinc-300">{inc.namespace}</span>
                      <span className="text-zinc-600">/</span>
                      <span className="text-zinc-500">resource:</span>
                      <span className="text-zinc-300">
                        {inc.resourceKind}/{inc.resourceName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Operational Activity Stream */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          Recent Audit & Activity Log
        </h2>

        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
          {recentActivity.length === 0 ? (
            <div className="text-xs font-mono text-zinc-500 py-2">No activity recorded yet.</div>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {recentActivity.map((act) => (
                <div key={act.id} className="flex items-start gap-3 text-zinc-300 pb-2 border-b border-zinc-800/40 last:border-0">
                  <span className="text-zinc-500 text-[11px] shrink-0">{formatTimeAgo(act.timestamp)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] shrink-0">
                    {act.type}
                  </span>
                  <span className="text-zinc-300 flex-1">{act.description}</span>
                  {act.incidentId && (
                    <button
                      onClick={() => onSelectIncident(act.incidentId!)}
                      className="text-sky-400 hover:text-sky-300 shrink-0 text-[11px]"
                    >
                      {act.incidentId} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
