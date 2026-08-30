import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Clock,
  Filter,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Cluster, Incident, IncidentSeverity, IncidentStatus } from '../../types/index';
import { SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, EmptyState } from '../common/UI';

interface IncidentsViewProps {
  incidents: Incident[];
  clusters: Cluster[];
  onSelectIncident: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  clusters,
  onSelectIncident,
  onRefresh,
  loading
}) => {
  const { canEditIncidents } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [clusterFilter, setClusterFilter] = useState<string>('ALL');
  const [clearing, setClearing] = useState(false);

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all incident tickets? Any active failing resources will regenerate tickets on the next telemetry sync.')) return;
    try {
      setClearing(true);
      await api.clearAllIncidents();
      onRefresh();
    } catch (err) {
      console.error('Failed to clear incidents:', err);
    } finally {
      setClearing(false);
    }
  };

  const formatTimeAgo = (ts?: number) => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  };

  const filteredIncidents = incidents.filter((inc) => {
    // Search
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      inc.id.toLowerCase().includes(q) ||
      inc.title.toLowerCase().includes(q) ||
      inc.resourceName.toLowerCase().includes(q) ||
      inc.namespace.toLowerCase().includes(q) ||
      inc.clusterName.toLowerCase().includes(q) ||
      inc.incidentType.toLowerCase().includes(q);

    // Status
    const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;

    // Severity
    const matchesSeverity = severityFilter === 'ALL' || inc.severity === severityFilter;

    // Cluster
    const matchesCluster = clusterFilter === 'ALL' || inc.clusterId === clusterFilter;

    return matchesSearch && matchesStatus && matchesSeverity && matchesCluster;
  });

  const activeFiltersCount =
    (statusFilter !== 'ALL' ? 1 : 0) + (severityFilter !== 'ALL' ? 1 : 0) + (clusterFilter !== 'ALL' ? 1 : 0);

  const resetFilters = () => {
    setStatusFilter('ALL');
    setSeverityFilter('ALL');
    setClusterFilter('ALL');
    setSearchTerm('');
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Deterministic Incident Tickets
          </h1>
          <p className="text-xs font-mono text-zinc-400 mt-1">
            Deduplicated Kubernetes failure states, occurrence counters, and investigation timelines
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditIncidents && incidents.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={loading || clearing}
              icon={<Trash2 className="w-3.5 h-3.5 text-zinc-400" />}
              className="text-zinc-400 hover:text-rose-400 hover:border-rose-900"
            >
              Clear All
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh Incidents
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3 font-mono text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="sm:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search SKY ID, resource, namespace..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Status: All</option>
              <option value="OPEN">Status: OPEN</option>
              <option value="ACKNOWLEDGED">Status: ACKNOWLEDGED</option>
              <option value="IN_PROGRESS">Status: IN_PROGRESS</option>
              <option value="RESOLVED">Status: RESOLVED</option>
              <option value="CLOSED">Status: CLOSED</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div className="sm:col-span-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Severity: All</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
              <option value="INFO">INFO</option>
            </select>
          </div>

          {/* Cluster Filter */}
          <div className="sm:col-span-3">
            <select
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Cluster: All Clusters</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-400">
            <span>{activeFiltersCount} active filter(s) applied</span>
            <button
              onClick={resetFilters}
              className="text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Incidents Table */}
      {filteredIncidents.length === 0 ? (
        <EmptyState
          title={incidents.length === 0 ? 'No active incidents' : 'No matching incidents'}
          description={
            incidents.length === 0
              ? 'SkyOps has not detected any failure conditions on your clusters.'
              : 'Try clearing your active filters or modifying search keywords.'
          }
        />
      ) : (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3">Incident ID</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Title / Problem</th>
                  <th className="px-5 py-3">Cluster / Target Resource</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Occurrences</th>
                  <th className="px-5 py-3">Last Seen</th>
                  <th className="px-5 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredIncidents.map((inc) => (
                  <tr
                    key={inc.id}
                    onClick={() => onSelectIncident(inc.id)}
                    className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-sky-400 font-mono">{inc.id}</span>
                      <div className="text-[10px] text-zinc-500 font-sans mt-0.5">{inc.incidentType}</div>
                    </td>

                    <td className="px-5 py-3.5">
                      <SeverityBadge severity={inc.severity} size="sm" />
                    </td>

                    <td className="px-5 py-3.5 max-w-sm">
                      <div className="font-semibold text-zinc-100 truncate">{inc.title}</div>
                      {inc.technicalDetails?.reason && (
                        <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                          Reason: {inc.technicalDetails.reason}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="text-zinc-300 font-medium">{inc.clusterName}</div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        ns: <strong className="text-zinc-400">{inc.namespace}</strong> • {inc.resourceKind}/
                        {inc.resourceName}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <StatusBadge status={inc.status} size="sm" />
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="font-bold text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                        {inc.occurrenceCount}x
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-zinc-400 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-zinc-300">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {formatTimeAgo(inc.lastSeenAt)}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => onSelectIncident(inc.id)}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
                      >
                        Investigate →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
