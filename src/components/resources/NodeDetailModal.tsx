import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  HardDrive,
  Layers,
  Server,
  Terminal,
  X
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { KubernetesResource } from '../../types/index';
import { PodPhaseBadge, ResourceHealthBadge } from '../common/Badges';
import { Button } from '../common/UI';

interface NodeDetailModalProps {
  node: KubernetesResource | null;
  clusterResources?: KubernetesResource[];
  clusterName?: string;
  onClose: () => void;
  onSelectPod?: (pod: KubernetesResource) => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
  node,
  clusterResources = [],
  clusterName,
  onClose,
  onSelectPod
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'pods' | 'conditions' | 'labels' | 'yaml'>('overview');
  const [copiedYaml, setCopiedYaml] = useState(false);
  const [podSearch, setPodSearch] = useState('');
  const [podStatusFilter, setPodStatusFilter] = useState<'all' | 'running' | 'degraded'>('all');

  // Filter pods running on this specific node
  const nodePods = useMemo(() => {
    if (!node) return [];
    return clusterResources.filter(
      (r) => r.kind === 'Pod' && (r.nodeName === node.name || (r.statusSummary as any)?.nodeName === node.name)
    );
  }, [node, clusterResources]);

  const filteredPods = useMemo(() => {
    return nodePods.filter((p) => {
      if (podSearch) {
        const q = podSearch.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesNs = (p.namespace || '').toLowerCase().includes(q);
        if (!matchesName && !matchesNs) return false;
      }
      if (podStatusFilter === 'running') {
        return p.status === 'Running';
      }
      if (podStatusFilter === 'degraded') {
        return p.health === 'CRITICAL' || p.status === 'CrashLoopBackOff' || p.status === 'Error' || p.status === 'Failed';
      }
      return true;
    });
  }, [nodePods, podSearch, podStatusFilter]);

  if (!node) return null;

  // Extract node metrics and hardware specs
  const kubeletVer =
    (node.statusSummary?.kubeletVersion as string) ||
    (node.specSummary?.kubeletVersion as string) ||
    'v1.35.1';
  const osImage = (node.specSummary?.osImage as string) || 'Ubuntu 24.04 LTS';
  const kernelVer = (node.specSummary?.kernelVersion as string) || '6.8.0-1017-aws';
  const arch = node.labels?.['kubernetes.io/arch'] || 'amd64';
  const os = node.labels?.['kubernetes.io/os'] || 'linux';
  const isControlPlane =
    node.name.includes('control-plane') ||
    node.name.includes('master') ||
    Boolean(node.labels?.['node-role.kubernetes.io/control-plane']);

  const capacityCpu = (node.statusSummary?.capacity as any)?.cpu || '4';
  const allocCpu = (node.statusSummary?.allocatable as any)?.cpu || node.statusSummary?.allocatableCpu || '3800m';
  const capacityMem = (node.statusSummary?.capacity as any)?.memory || '16Gi';
  const allocMem = (node.statusSummary?.allocatable as any)?.memory || node.statusSummary?.allocatableMemory || '15.4Gi';
  const maxPods = Number((node.statusSummary?.capacity as any)?.pods || 110);

  const cpuUsage = typeof node.cpuUsage === 'number' ? node.cpuUsage : 32.5;
  const memoryUsage = typeof node.memoryUsage === 'number' ? node.memoryUsage : 54.8;
  const podDensityPercent = Math.min(100, Math.round((nodePods.length / maxPods) * 100));

  const conditions = Array.isArray(node.conditions) ? node.conditions : [];

  const handleCopyYaml = () => {
    navigator.clipboard.writeText(JSON.stringify(node, null, 2));
    setCopiedYaml(true);
    setTimeout(() => setCopiedYaml(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-800 flex items-start justify-between gap-4 bg-zinc-950/60">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800">
                {isControlPlane ? 'Control Plane Node' : 'Worker Node'}
              </span>
              <h2 className="text-lg font-bold text-zinc-100 font-mono truncate">{node.name}</h2>
              <ResourceHealthBadge health={node.health || 'HEALTHY'} size="md" />
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                  node.status === 'Ready'
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950/70 text-rose-300 border border-rose-800'
                }`}
              >
                {node.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span>Cluster: <strong className="text-zinc-200">{clusterName || node.clusterId}</strong></span>
              <span>•</span>
              <span>Kubelet: <strong className="text-zinc-200">{kubeletVer}</strong></span>
              <span>•</span>
              <span>Architecture: <strong className="text-zinc-200">{os}/{arch}</strong></span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-zinc-800 bg-zinc-950/30 overflow-x-auto text-xs font-mono">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Overview & Telemetry
          </button>

          <button
            onClick={() => setActiveTab('pods')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'pods'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Pods on Node ({nodePods.length})
          </button>

          <button
            onClick={() => setActiveTab('conditions')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'conditions'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Node Conditions ({conditions.length})
          </button>

          <button
            onClick={() => setActiveTab('labels')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'labels'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            Labels & Metadata
          </button>

          <button
            onClick={() => setActiveTab('yaml')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'yaml'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            JSON / Spec
          </button>
        </div>

        {/* Modal Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Telemetry Resource Gauges */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* CPU Gauge */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-sky-400" />
                      CPU Allocation
                    </span>
                    <span className="font-bold text-zinc-200">{cpuUsage}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        cpuUsage > 85 ? 'bg-rose-500' : cpuUsage > 70 ? 'bg-amber-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, cpuUsage))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1">
                    <span>Allocatable: {String(allocCpu)}</span>
                    <span>Cap: {String(capacityCpu)} cores</span>
                  </div>
                </div>

                {/* Memory Gauge */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                      Memory Allocation
                    </span>
                    <span className="font-bold text-zinc-200">{memoryUsage}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        memoryUsage > 85 ? 'bg-rose-500' : memoryUsage > 70 ? 'bg-amber-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, memoryUsage))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1">
                    <span>Allocatable: {String(allocMem)}</span>
                    <span>Cap: {String(capacityMem)}</span>
                  </div>
                </div>

                {/* Pod Capacity Gauge */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      Pod Capacity Density
                    </span>
                    <span className="font-bold text-zinc-200">
                      {nodePods.length} / {maxPods}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${podDensityPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1">
                    <span>Active Pods: {nodePods.length}</span>
                    <span>{podDensityPercent}% capacity</span>
                  </div>
                </div>
              </div>

              {/* Node Hardware & Kernel Specifications */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider">
                  Node System & Kernel Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">OS Image</span>
                    <span className="text-xs font-mono font-semibold text-zinc-200 truncate block">{osImage}</span>
                  </div>
                  <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Kernel Version</span>
                    <span className="text-xs font-mono font-semibold text-zinc-200 truncate block">{kernelVer}</span>
                  </div>
                  <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Kubelet Version</span>
                    <span className="text-xs font-mono font-semibold text-sky-400 truncate block">{kubeletVer}</span>
                  </div>
                  <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-zinc-500 block">Container Runtime</span>
                    <span className="text-xs font-mono font-semibold text-zinc-200 truncate block">containerd://1.7.13</span>
                  </div>
                </div>
              </div>

              {/* Quick Health & Condition Highlights */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider">
                  Health Check Highlights
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {conditions.map((cond, idx) => {
                    const isOk =
                      (cond.type === 'Ready' && cond.status === 'True') ||
                      (cond.type !== 'Ready' && cond.status === 'False');
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                          isOk
                            ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
                            : 'bg-rose-950/20 border-rose-900/40 text-rose-300'
                        }`}
                      >
                        {isOk ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <div className="min-w-0 font-mono">
                          <div className="text-xs font-semibold truncate">{cond.type}</div>
                          <div className="text-[10px] opacity-75">{cond.status === 'True' ? 'Active' : 'Normal'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pods' && (
            <div className="space-y-4">
              {/* Pods Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPodStatusFilter('all')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      podStatusFilter === 'all'
                        ? 'bg-zinc-800 text-zinc-100 font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All ({nodePods.length})
                  </button>
                  <button
                    onClick={() => setPodStatusFilter('running')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      podStatusFilter === 'running'
                        ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-800'
                        : 'text-zinc-400 hover:text-emerald-300'
                    }`}
                  >
                    Running
                  </button>
                  <button
                    onClick={() => setPodStatusFilter('degraded')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      podStatusFilter === 'degraded'
                        ? 'bg-rose-950 text-rose-300 font-bold border border-rose-800'
                        : 'text-zinc-400 hover:text-rose-300'
                    }`}
                  >
                    Degraded
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Filter pods by name..."
                  value={podSearch}
                  onChange={(e) => setPodSearch(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 w-60"
                />
              </div>

              {filteredPods.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 font-mono text-xs border border-zinc-800 rounded-xl bg-zinc-950/40">
                  No pods currently match this filter on node {node.name}.
                </div>
              ) : (
                <div className="border border-zinc-800 rounded-xl overflow-hidden font-mono text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-950 text-zinc-400 text-[11px] uppercase border-b border-zinc-800">
                      <tr>
                        <th className="p-3">Pod Name</th>
                        <th className="p-3">Namespace</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Health</th>
                        <th className="p-3">CPU / Mem</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40">
                      {filteredPods.map((p) => (
                        <tr
                          key={p.id}
                          className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                          onClick={() => onSelectPod && onSelectPod(p)}
                        >
                          <td className="p-3 font-semibold text-zinc-200 group-hover:text-sky-300 truncate max-w-[220px]">
                            {p.name}
                          </td>
                          <td className="p-3 text-zinc-400 truncate max-w-[120px]">{p.namespace}</td>
                          <td className="p-3">
                            <PodPhaseBadge phase={p.status} />
                          </td>
                          <td className="p-3">
                            <ResourceHealthBadge health={p.health || 'HEALTHY'} size="sm" />
                          </td>
                          <td className="p-3 text-zinc-400">
                            {p.cpuUsage ?? 2.5}% / {p.memoryUsage ?? 15}%
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPod && onSelectPod(p);
                              }}
                              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-sky-900/60 hover:text-sky-200 text-zinc-300 text-xs"
                            >
                              Inspect Pod →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'conditions' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
                {conditions.map((cond, idx) => {
                  const isHealthy =
                    (cond.type === 'Ready' && cond.status === 'True') ||
                    (cond.type !== 'Ready' && cond.status === 'False');
                  return (
                    <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-200 text-sm">{cond.type}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isHealthy
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950/80 text-rose-300 border border-rose-800'
                            }`}
                          >
                            Status: {cond.status}
                          </span>
                        </div>
                        <p className="text-zinc-400 text-xs">{cond.message || 'No additional condition message.'}</p>
                      </div>

                      <div className="text-right text-[11px] text-zinc-500 shrink-0">
                        <div>Reason: <strong className="text-zinc-300">{cond.reason || 'N/A'}</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'labels' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Kubernetes Node Labels</h4>
                <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-wrap gap-2">
                  {node.labels && Object.keys(node.labels).length > 0 ? (
                    Object.entries(node.labels).map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1.5"
                      >
                        <span className="text-sky-400">{k}:</span>
                        <span className="text-zinc-100">{v || 'true'}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-zinc-500">No node labels found.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'yaml' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Node Resource Definition</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyYaml}
                  icon={copiedYaml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                >
                  {copiedYaml ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 overflow-x-auto text-[11px] text-zinc-300 leading-relaxed max-h-96">
                {JSON.stringify(node, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
