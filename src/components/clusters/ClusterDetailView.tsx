import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Clock,
  Layers,
  ListTree,
  Radio,
  RefreshCw,
  Search,
  Server,
  Terminal
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AgentManifestsResponse, Cluster, KubernetesResource } from '../../types/index';
import { ClusterStatusBadge, SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, CodeBlock, CopyButton, EmptyState, LoadingState, Modal } from '../common/UI';

interface ClusterDetailViewProps {
  clusterId: string;
  onBack: () => void;
  onSelectIncident?: (id: string) => void;
}

type ResourceTab = 'pods' | 'nodes' | 'deployments' | 'statefulsets' | 'pvcs' | 'events' | 'agent';

export const ClusterDetailView: React.FC<ClusterDetailViewProps> = ({ clusterId, onBack, onSelectIncident }) => {
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [resources, setResources] = useState<KubernetesResource[]>([]);
  const [manifestData, setManifestData] = useState<AgentManifestsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ResourceTab>('pods');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<KubernetesResource | null>(null);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const [clusterRes, resourcesRes, manifestsRes] = await Promise.all([
        api.getCluster(clusterId),
        api.getClusterResources(clusterId),
        api.getClusterManifests(clusterId)
      ]);
      setCluster(clusterRes);
      setResources(resourcesRes);
      setManifestData(manifestsRes);
    } catch (err) {
      console.error('Error fetching cluster details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [clusterId]);

  const formatTimeAgo = (ts?: number) => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  };

  const getFilteredResources = () => {
    let list: KubernetesResource[] = [];
    if (activeTab === 'pods') list = resources.filter((r) => r.kind === 'Pod');
    else if (activeTab === 'nodes') list = resources.filter((r) => r.kind === 'Node');
    else if (activeTab === 'deployments') list = resources.filter((r) => r.kind === 'Deployment');
    else if (activeTab === 'statefulsets') list = resources.filter((r) => r.kind === 'StatefulSet' || r.kind === 'DaemonSet');
    else if (activeTab === 'pvcs') list = resources.filter((r) => r.kind === 'PersistentVolumeClaim' || r.kind === 'PVC');

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || (r.namespace && r.namespace.toLowerCase().includes(q))
      );
    }

    return list;
  };

  const allEvents = resources.flatMap((r) => r.events || []).sort((a, b) => b.timestamp - a.timestamp);

  if (loading && !cluster) {
    return <LoadingState message="Loading cluster diagnostics..." />;
  }

  if (!cluster) {
    return (
      <div className="p-8">
        <EmptyState title="Cluster Not Found" description="The requested cluster could not be located." action={{ label: 'Back to Clusters', onClick: onBack }} />
      </div>
    );
  }

  const tabs: Array<{ id: ResourceTab; label: string; count?: number }> = [
    { id: 'pods', label: 'Pods', count: resources.filter((r) => r.kind === 'Pod').length },
    { id: 'nodes', label: 'Nodes', count: resources.filter((r) => r.kind === 'Node').length },
    { id: 'deployments', label: 'Deployments', count: resources.filter((r) => r.kind === 'Deployment').length },
    { id: 'statefulsets', label: 'Stateful & DaemonSets', count: resources.filter((r) => r.kind === 'StatefulSet' || r.kind === 'DaemonSet').length },
    { id: 'pvcs', label: 'Storage (PVC)', count: resources.filter((r) => r.kind === 'PersistentVolumeClaim' || r.kind === 'PVC').length },
    { id: 'events', label: 'Cluster Events', count: allEvents.length },
    { id: 'agent', label: 'Agent Install Manifest' }
  ];

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-zinc-100 font-mono">{cluster.name}</h1>
              <ClusterStatusBadge status={cluster.status} agentStatus={cluster.agentStatus} />
            </div>
            <div className="text-xs font-mono text-zinc-500 mt-0.5">{cluster.id}</div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchDetails}
          icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
        >
          Refresh Telemetry
        </Button>
      </div>

      {/* Cluster Overview Stats Bar */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs font-mono">
        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Agent Status</span>
          <span className="text-zinc-200 font-semibold flex items-center gap-1.5 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${
                cluster.agentStatus === 'CONNECTED'
                  ? 'bg-emerald-500'
                  : cluster.agentStatus === 'DEGRADED'
                  ? 'bg-amber-500'
                  : 'bg-zinc-600'
              }`}
            />
            {cluster.agentStatus}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Last Heartbeat</span>
          <span className="text-zinc-200 font-semibold block mt-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            {formatTimeAgo(cluster.lastHeartbeat)}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Kubernetes Version</span>
          <span className="text-zinc-200 font-semibold block mt-1">{cluster.k8sVersion || 'v1.31.2'}</span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Node / Pod Density</span>
          <span className="text-zinc-200 font-semibold block mt-1">
            {cluster.nodeCount} Nodes / {cluster.podCount} Pods
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Active Incidents</span>
          <span
            className={`font-semibold block mt-1 ${
              cluster.openIncidentCount > 0 ? 'text-rose-400 font-bold' : 'text-zinc-400'
            }`}
          >
            {cluster.openIncidentCount} open
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSearchTerm('');
            }}
            className={`px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-sky-500 text-sky-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-zinc-400">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'agent' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-200 font-mono">Agent Installation Manifest & Helm Configuration</h3>
          </div>
          {manifestData && (
            <div className="space-y-4">
              <CodeBlock code={manifestData.kubectlManifest} language="yaml" title="kubectl apply manifest" />
              <CodeBlock code={manifestData.helmCommand} language="bash" title="Helm Upgrade / Install" />
            </div>
          )}
        </div>
      ) : activeTab === 'events' ? (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-zinc-200 font-mono">Observed Kubernetes Cluster Events</h3>
          {allEvents.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-900/30">
              No warning or error events recorded in this cluster.
            </div>
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900 text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Reason</th>
                    <th className="px-4 py-2.5">Object</th>
                    <th className="px-4 py-2.5">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {allEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-zinc-800/40">
                      <td className="px-4 py-2 text-zinc-500 whitespace-nowrap">{formatTimeAgo(evt.timestamp)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            evt.type === 'Warning'
                              ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {evt.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-semibold text-zinc-200">{evt.reason}</td>
                      <td className="px-4 py-2 text-zinc-400">
                        {evt.objectKind}/{evt.objectName}
                        {evt.namespace ? ` (${evt.namespace})` : ''}
                      </td>
                      <td className="px-4 py-2 text-zinc-300 max-w-md truncate">{evt.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder={`Filter ${activeTab}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
            <div className="text-xs font-mono text-zinc-500">{getFilteredResources().length} resources</div>
          </div>

          {getFilteredResources().length === 0 ? (
            <EmptyState
              title={`No ${activeTab} recorded`}
              description={`The SkyOps Agent has not reported any ${activeTab} for this cluster yet.`}
            />
          ) : (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900 text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Namespace</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Diagnostics / Replicas</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {getFilteredResources().map((res) => {
                    const hasAnomalies =
                      res.health === 'CRITICAL' ||
                      res.status === 'CrashLoopBackOff' ||
                      res.status === 'NotReady' ||
                      res.status === 'Degraded';

                    return (
                      <tr
                        key={res.id}
                        onClick={() => setSelectedResource(res)}
                        className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-semibold text-zinc-100 flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              hasAnomalies ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                            }`}
                          />
                          {res.name}
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{res.namespace || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                              hasAnomalies
                                ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                                : 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50'
                            }`}
                          >
                            {res.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          {res.kind === 'Pod' && res.containers ? (
                            <span>
                              {res.containers.length} container(s) •{' '}
                              {res.containers.some((c) => c.restartCount > 0)
                                ? `${res.containers.reduce((acc, c) => acc + c.restartCount, 0)} restarts`
                                : '0 restarts'}
                            </span>
                          ) : res.kind === 'Deployment' ? (
                            <span>
                              {String(res.statusSummary?.availableReplicas || 0)}/
                              {String(res.specSummary?.replicas || 1)} available
                            </span>
                          ) : res.kind === 'Node' ? (
                            <span>{String(res.statusSummary?.allocatableMemory || '64Gi')} Allocatable</span>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedResource(res)}
                            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded font-mono"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Resource Detail Modal */}
      {selectedResource && (
        <Modal
          isOpen={!!selectedResource}
          onClose={() => setSelectedResource(null)}
          title={`${selectedResource.kind}: ${selectedResource.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs font-mono">
            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-zinc-500 block">Kind</span>
                <span className="text-zinc-200">{selectedResource.kind}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Namespace</span>
                <span className="text-zinc-200">{selectedResource.namespace || 'default'}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Status</span>
                <span className="text-rose-400 font-semibold">{selectedResource.status}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Last Sync</span>
                <span className="text-zinc-400">{formatTimeAgo(selectedResource.updatedAt)}</span>
              </div>
            </div>

            {/* Containers breakdown */}
            {selectedResource.containers && selectedResource.containers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Containers</h4>
                <div className="space-y-2">
                  {selectedResource.containers.map((c, idx) => (
                    <div key={idx} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-200">{c.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            c.ready ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                          }`}
                        >
                          {c.ready ? 'Ready' : 'Not Ready'}
                        </span>
                      </div>
                      <div className="text-zinc-400 text-[11px] truncate">Image: {c.image}</div>
                      <div className="text-zinc-400 text-[11px]">Restarts: {c.restartCount}</div>
                      {c.waitingReason && (
                        <div className="p-2 bg-rose-950/30 border border-rose-900/50 rounded text-rose-300 text-[11px]">
                          <strong>Waiting Reason:</strong> {c.waitingReason}
                          {c.waitingMessage && <div className="mt-0.5 text-rose-400">{c.waitingMessage}</div>}
                        </div>
                      )}
                      {c.terminationReason && (
                        <div className="p-2 bg-rose-950/30 border border-rose-900/50 rounded text-rose-300 text-[11px]">
                          <strong>Termination Reason:</strong> {c.terminationReason} (Exit Code: {c.exitCode})
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conditions breakdown */}
            {selectedResource.conditions && selectedResource.conditions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Conditions</h4>
                <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-950">
                  {selectedResource.conditions.map((cond, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between">
                      <span className="text-zinc-300">{cond.type}</span>
                      <span
                        className={`font-semibold ${
                          cond.status === 'True'
                            ? cond.type.includes('Pressure')
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                            : cond.type === 'Ready'
                            ? 'text-rose-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {cond.status} {cond.reason ? `(${cond.reason})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
