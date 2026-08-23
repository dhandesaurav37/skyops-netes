import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Clock,
  KeyRound,
  Layers,
  ListTree,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Unplug
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AGENT_DEFAULT_NAMESPACE, AGENT_IMAGE_REPOSITORY, AGENT_VERSION } from '../../config/version';
import { useAuth } from '../../context/AuthContext';
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
  const { role } = useAuth();
  const canManage = role === 'OWNER' || role === 'ADMIN';

  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [resources, setResources] = useState<KubernetesResource[]>([]);
  const [manifestData, setManifestData] = useState<AgentManifestsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ResourceTab>('pods');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<KubernetesResource | null>(null);

  // Handshake & Credentials modal states
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [inputConnectionCode, setInputConnectionCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);

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
      if (manifestsRes.connectionCode) {
        setInputConnectionCode(manifestsRes.connectionCode);
      }
    } catch (err) {
      console.error('Error fetching cluster details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [clusterId]);

  const handleVerifyConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputConnectionCode.trim()) return;

    try {
      setVerifying(true);
      setActionError(null);
      const res = await api.connectCluster(clusterId, inputConnectionCode.trim());
      setCluster(res.cluster);
      setActionSuccess('Cluster connection verified successfully!');
      setConnectModalOpen(false);
      fetchDetails();
    } catch (err: any) {
      setActionError(err.message || 'Failed to verify connection code');
    } finally {
      setVerifying(false);
    }
  };

  const handleRegenerateCredentials = async () => {
    if (!confirm('Regenerating credentials will invalidate the existing agent token and require reinstalling or updating the agent secret. Continue?')) {
      return;
    }

    try {
      setRegenerateLoading(true);
      setActionError(null);
      const res = await api.regenerateClusterToken(clusterId);
      setCluster(res.cluster);
      if (res.connectionCode) {
        setInputConnectionCode(res.connectionCode);
      }
      setActionSuccess('Agent credentials regenerated. Please update your cluster secret.');
      fetchDetails();
    } catch (err: any) {
      setActionError(err.message || 'Failed to regenerate credentials');
    } finally {
      setRegenerateLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Are you sure you want to disconnect agent from cluster ${cluster?.name}? Incident history will be preserved.`)) {
      return;
    }

    try {
      setDisconnectLoading(true);
      setActionError(null);
      await api.disconnectCluster(clusterId);
      setActionSuccess('Cluster agent disconnected.');
      fetchDetails();
    } catch (err: any) {
      setActionError(err.message || 'Failed to disconnect cluster');
    } finally {
      setDisconnectLoading(false);
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

      {/* Action Alerts */}
      {actionSuccess && (
        <div className="p-3 text-xs rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-zinc-400 hover:text-zinc-200">
            &times;
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 text-xs rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-zinc-400 hover:text-zinc-200">
            &times;
          </button>
        </div>
      )}

      {/* Cluster Handshake Pending Banner */}
      {cluster.connectionState !== 'connected' && cluster.agentStatus !== 'CONNECTED' && (
        <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="p-2 rounded-lg bg-amber-900/40 text-amber-300 border border-amber-700/60">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="font-semibold text-amber-200">
                {cluster.connectionState === 'agent_detected' || cluster.agentStatus === 'AGENT_DETECTED'
                  ? 'Agent Detected — Awaiting Handshake Verification'
                  : 'Pending Agent Installation & Handshake'}
              </div>
              <div className="text-amber-400/80 text-[11px] mt-0.5">
                {cluster.connectionState === 'agent_detected' || cluster.agentStatus === 'AGENT_DETECTED'
                  ? 'The cluster agent reached SkyOps. Verify your connection code to finalize the connection.'
                  : 'Deploy the SkyOps Agent into your cluster to initiate telemetry ingestion.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setConnectModalOpen(true)}
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              Verify Connection Code
            </Button>
          </div>
        </div>
      )}

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
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-200 font-mono">Agent Installation & Cluster Handshake</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Manage agent connection credentials, view deployment manifests, and monitor cluster connectivity.
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                {cluster.connectionState !== 'connected' && cluster.agentStatus !== 'CONNECTED' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setConnectModalOpen(true)}
                    icon={<ShieldCheck className="w-3.5 h-3.5" />}
                  >
                    Verify Handshake
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateCredentials}
                  disabled={regenerateLoading}
                  icon={regenerateLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                >
                  Regenerate Token
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnectLoading}
                  icon={disconnectLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                >
                  Disconnect
                </Button>
              </div>
            )}
          </div>

          {manifestData && (
            <div className="space-y-4">
              <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <div className="text-zinc-500">Authoritative Version</div>
                  <div className="text-zinc-200 font-semibold">{manifestData.agentVersion || AGENT_VERSION}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Container Repository</div>
                  <div className="text-sky-400 font-semibold truncate">{AGENT_IMAGE_REPOSITORY}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Target Namespace</div>
                  <div className="text-zinc-200 font-semibold">{manifestData.namespace || AGENT_DEFAULT_NAMESPACE}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Agent Handshake</div>
                  <div className="text-zinc-200 font-semibold">
                    {cluster.connectionState === 'connected' ? (
                      <span className="text-emerald-400">Connected & Verified</span>
                    ) : (
                      <span className="text-amber-400">Pending Verification</span>
                    )}
                  </div>
                </div>
              </div>

              {manifestData.installCommand && (
                <CodeBlock
                  code={manifestData.installCommand}
                  language="bash"
                  title="Quick Install Command"
                />
              )}
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

      {/* Verify Connection Handshake Modal */}
      {connectModalOpen && (
        <Modal
          isOpen={connectModalOpen}
          onClose={() => setConnectModalOpen(false)}
          title={`Verify Handshake — ${cluster.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleVerifyConnection} className="space-y-4">
            <p className="text-xs text-zinc-400">
              Enter the single-use connection registration code generated when this cluster was registered or from the agent installation output to finalize the connection.
            </p>

            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1">
                Connection Registration Code
              </label>
              <input
                type="text"
                required
                placeholder="SKYOPS-CONNECT-XXXX-XXXX"
                value={inputConnectionCode}
                onChange={(e) => setInputConnectionCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono tracking-wider"
              />
            </div>

            <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3 text-zinc-400" />
              <span>Valid for 30 minutes after cluster creation or credential regeneration.</span>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button variant="ghost" type="button" onClick={() => setConnectModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={verifying || !inputConnectionCode.trim()}
                icon={verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              >
                {verifying ? 'Verifying...' : 'Verify & Connect'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
