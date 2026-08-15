import { Check, CheckCircle2, Copy, Download, Loader2, Server, Terminal, X } from 'lucide-react';
import React, { useState } from 'react';
import { api } from '../../api/client';
import { AgentManifestsResponse, Cluster } from '../../types/index';
import { Button, CodeBlock, CopyButton, Modal } from '../common/UI';

interface AddClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClusterCreated: (cluster: Cluster) => void;
}

export const AddClusterModal: React.FC<AddClusterModalProps> = ({ isOpen, onClose, onClusterCreated }) => {
  const [step, setStep] = useState<'create' | 'install'>('create');
  const [clusterName, setClusterName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCluster, setCreatedCluster] = useState<Cluster | null>(null);
  const [manifestData, setManifestData] = useState<AgentManifestsResponse | null>(null);
  const [installMethod, setInstallMethod] = useState<'kubectl' | 'helm'>('kubectl');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clusterName.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.createCluster(clusterName.trim(), description.trim());
      setCreatedCluster(res.cluster);
      onClusterCreated(res.cluster);

      // Fetch manifests
      const manifests = await api.getClusterManifests(res.cluster.id);
      setManifestData(manifests);
      setStep('install');
    } catch (err: any) {
      setError(err.message || 'Failed to create cluster');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('create');
    setClusterName('');
    setDescription('');
    setCreatedCluster(null);
    setManifestData(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleReset}
      title={step === 'create' ? 'Register New Kubernetes Cluster' : `Install SkyOps Agent — ${createdCluster?.name}`}
      maxWidth={step === 'create' ? 'md' : 'xl'}
    >
      {step === 'create' ? (
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="text-xs text-zinc-400">
            Enter a descriptive name for your Kubernetes cluster (e.g. <code className="font-mono text-zinc-300">production-us-east-1</code>, <code className="font-mono text-zinc-300">staging-eks</code>).
          </div>

          {error && <div className="p-3 text-xs rounded bg-rose-950/40 border border-rose-800 text-rose-300 font-mono">{error}</div>}

          <div>
            <label className="block text-xs font-mono font-medium text-zinc-300 mb-1">
              Cluster Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. prod-gke-asia-cluster"
              value={clusterName}
              onChange={(e) => setClusterName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-medium text-zinc-300 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Primary customer-facing Kubernetes cluster"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button variant="ghost" onClick={handleReset} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={loading || !clusterName.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate Agent Manifests'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          {/* Agent Information Header */}
          <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <span className="text-zinc-500 block">Cluster ID</span>
              <span className="text-zinc-200 font-semibold truncate block">{manifestData?.clusterId}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Namespace</span>
              <span className="text-zinc-200 block">{manifestData?.namespace}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Agent Version</span>
              <span className="text-sky-400 block">{manifestData?.agentVersion}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Ingress Server</span>
              <span className="text-zinc-200 truncate block">{manifestData?.serverUrl}</span>
            </div>
          </div>

          {/* Method Selector Tabs */}
          <div className="flex items-center gap-2 border-b border-zinc-800">
            <button
              onClick={() => setInstallMethod('kubectl')}
              className={`px-4 py-2 text-xs font-mono font-medium border-b-2 transition-colors flex items-center gap-2 ${
                installMethod === 'kubectl'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              kubectl Manifest Installation
            </button>
            <button
              onClick={() => setInstallMethod('helm')}
              className={`px-4 py-2 text-xs font-mono font-medium border-b-2 transition-colors flex items-center gap-2 ${
                installMethod === 'helm'
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Helm Chart Installation
            </button>
          </div>

          {/* Installation Instructions */}
          {installMethod === 'kubectl' ? (
            <div>
              <p className="text-xs text-zinc-400 mb-2">
                Apply the deployment manifest directly to your cluster using <code className="font-mono text-zinc-300">kubectl</code>. This provisions the <code className="font-mono text-zinc-300">skyops-system</code> namespace, RBAC permissions, and the agent daemon.
              </p>
              {manifestData && (
                <CodeBlock
                  code={manifestData.kubectlManifest}
                  language="yaml"
                  title="skyops-agent.yaml"
                />
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-zinc-400 mb-2">
                Deploy the SkyOps Agent via Helm into your Kubernetes cluster:
              </p>
              {manifestData && (
                <CodeBlock
                  code={manifestData.helmCommand}
                  language="bash"
                  title="Helm Command"
                />
              )}
            </div>
          )}

          {/* Verification Status */}
          <div className="p-3.5 rounded-lg bg-sky-950/30 border border-sky-800/40 flex items-center justify-between text-xs font-mono text-sky-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              <span>Awaiting first heartbeat from cluster agent...</span>
            </div>
            <span className="text-zinc-400 text-[11px]">Interval: 30s</span>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button variant="primary" onClick={handleReset}>
              Done / Return to Clusters
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
