import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AgentManifestsResponse, Cluster } from '../../types/index';
import { Button, CodeBlock, CopyButton, Modal } from '../common/UI';

interface AddClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClusterCreated: (cluster: Cluster) => void;
}

export const AddClusterModal: React.FC<AddClusterModalProps> = ({ isOpen, onClose, onClusterCreated }) => {
  const [step, setStep] = useState<'create' | 'connect'>('create');
  const [clusterName, setClusterName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCluster, setCreatedCluster] = useState<Cluster | null>(null);
  const [manifestData, setManifestData] = useState<AgentManifestsResponse | null>(null);
  const [installMethod, setInstallMethod] = useState<'command' | 'yaml' | 'helm'>('command');

  // Connection handshake states
  const [connectionCode, setConnectionCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'pending' | 'agent_detected' | 'connected'>('pending');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clusterName.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.createCluster(clusterName.trim(), description.trim());
      setCreatedCluster(res.cluster);
      if (res.connectionCode) {
        setConnectionCode(res.connectionCode);
      }
      onClusterCreated(res.cluster);

      // Fetch manifests
      const manifests = await api.getClusterManifests(res.cluster.id);
      setManifestData(manifests);
      if (manifests.connectionCode) {
        setConnectionCode(manifests.connectionCode);
      }
      setStep('connect');
    } catch (err: any) {
      setError(err.message || 'Failed to create cluster');
    } finally {
      setLoading(false);
    }
  };

  // Poll cluster state while modal is on the connection step to detect agent handshake
  useEffect(() => {
    if (!isOpen || step !== 'connect' || !createdCluster?.id || verifySuccess) return;

    const interval = setInterval(async () => {
      try {
        const cluster = await api.getCluster(createdCluster.id);
        if (cluster.agentStatus === 'CONNECTED' || cluster.connectionState === 'connected') {
          setAgentStatus('connected');
          setVerifySuccess(true);
        } else if (cluster.agentStatus === 'AGENT_DETECTED' || cluster.connectionState === 'agent_detected') {
          setAgentStatus('agent_detected');
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, step, createdCluster?.id, verifySuccess]);

  const handleVerifyConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!createdCluster?.id || !connectionCode.trim()) return;

    try {
      setVerifying(true);
      setError(null);
      const res = await api.connectCluster(createdCluster.id, connectionCode.trim());
      setVerifySuccess(true);
      setAgentStatus('connected');
      setCreatedCluster(res.cluster);
      onClusterCreated(res.cluster);
    } catch (err: any) {
      setError(err.message || 'Failed to verify connection code');
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setStep('create');
    setClusterName('');
    setDescription('');
    setCreatedCluster(null);
    setManifestData(null);
    setConnectionCode('');
    setVerifying(false);
    setVerifySuccess(false);
    setAgentStatus('pending');
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleReset}
      title={step === 'create' ? 'Register Kubernetes Cluster' : `Connect Cluster — ${createdCluster?.name}`}
      maxWidth={step === 'create' ? 'md' : 'xl'}
    >
      {step === 'create' ? (
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="text-xs text-zinc-400">
            Create a pending cluster configuration in SkyOps. You will receive an installation command and single-use connection code to link your live Kubernetes cluster.
          </div>

          {error && <div className="p-3 text-xs rounded bg-rose-950/40 border border-rose-800 text-rose-300 font-mono">{error}</div>}

          <div>
            <label className="block text-xs font-mono font-medium text-zinc-300 mb-1">
              Cluster Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. production-gke-asia"
              value={clusterName}
              onChange={(e) => setClusterName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-medium text-zinc-300 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Production customer workload cluster in GCP"
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
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Cluster & Generate Agent'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {/* Cluster Metadata Header */}
          <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <span className="text-zinc-500 block">Cluster ID</span>
              <span className="text-zinc-200 font-semibold truncate block">{manifestData?.clusterId}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Namespace</span>
              <span className="text-zinc-200 block">{manifestData?.namespace || 'skyops-system'}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Agent Image</span>
              <span className="text-sky-400 block truncate">skyops-agent:{manifestData?.agentVersion || 'sha-fb3a472'}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Ingress Server</span>
              <span className="text-zinc-200 truncate block">{manifestData?.serverUrl}</span>
            </div>
          </div>

          {/* STEP 1: Install SkyOps Agent */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 text-xs font-mono font-bold flex items-center justify-center">
                  1
                </span>
                <h3 className="text-sm font-semibold text-zinc-100 font-mono">Install SkyOps Agent</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setInstallMethod('command')}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                    installMethod === 'command'
                      ? 'bg-zinc-800 text-sky-400 border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Quick Command
                </button>
                <button
                  type="button"
                  onClick={() => setInstallMethod('yaml')}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                    installMethod === 'yaml'
                      ? 'bg-zinc-800 text-sky-400 border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Full YAML
                </button>
                <button
                  type="button"
                  onClick={() => setInstallMethod('helm')}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                    installMethod === 'helm'
                      ? 'bg-zinc-800 text-sky-400 border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Helm
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              Run this command in your Kubernetes cluster to deploy the read-only observability agent daemon.
            </p>

            {installMethod === 'command' && manifestData && (
              <CodeBlock
                code={manifestData.installCommand || `kubectl apply -f ${manifestData.serverUrl}/api/v1/clusters/${manifestData.clusterId}/manifest.yaml`}
                language="bash"
                title="Single-Line Installation Command"
              />
            )}

            {installMethod === 'yaml' && manifestData && (
              <CodeBlock
                code={manifestData.kubectlManifest}
                language="yaml"
                title="skyops-agent.yaml"
              />
            )}

            {installMethod === 'helm' && manifestData && (
              <CodeBlock
                code={manifestData.helmCommand}
                language="bash"
                title="Helm Installation"
              />
            )}
          </div>

          {/* STEP 2: Complete Connection Handshake */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 text-xs font-mono font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-sm font-semibold text-zinc-100 font-mono">Complete Connection Handshake</h3>
            </div>

            <p className="text-xs text-zinc-400">
              After installing the agent, verify the single-use connection code generated for your cluster to activate live telemetry and incident monitoring.
            </p>

            {/* Live Agent Detection Indicator */}
            <div
              className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono transition-colors ${
                verifySuccess || agentStatus === 'connected'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : agentStatus === 'agent_detected'
                  ? 'bg-sky-950/40 border-sky-800/60 text-sky-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              <div className="flex items-center gap-2">
                {verifySuccess || agentStatus === 'connected' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : agentStatus === 'agent_detected' ? (
                  <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                )}

                <span>
                  {verifySuccess || agentStatus === 'connected'
                    ? 'Cluster Connected — Telemetry Active'
                    : agentStatus === 'agent_detected'
                    ? 'Agent Detected in Cluster — Ready to connect'
                    : 'Awaiting Agent Handshake Contact...'}
                </span>
              </div>
              <span className="text-[11px] text-zinc-500">
                {verifySuccess ? 'Verified' : 'Polling every 3s'}
              </span>
            </div>

            {error && (
              <div className="p-3 text-xs rounded bg-rose-950/40 border border-rose-800 text-rose-300 font-mono">
                {error}
              </div>
            )}

            {!verifySuccess ? (
              <form onSubmit={handleVerifyConnect} className="space-y-3">
                <div>
                  <label className="block text-xs font-mono font-medium text-zinc-300 mb-1">
                    Connection Registration Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="SKYOPS-CONNECT-XXXX-XXXX"
                      value={connectionCode}
                      onChange={(e) => setConnectionCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono tracking-wider"
                    />
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={verifying || !connectionCode.trim()}
                      icon={verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    >
                      {verifying ? 'Verifying...' : 'Connect'}
                    </Button>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3 text-zinc-400" />
                  <span>The code is single-use and short-lived for cluster security.</span>
                </div>
              </form>
            ) : (
              <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 text-xs font-mono flex items-center justify-between">
                <div>
                  <div className="font-semibold text-emerald-200">Handshake Complete!</div>
                  <div className="text-emerald-400/80 text-[11px] mt-0.5">
                    Your Kubernetes cluster is now connected and actively ingesting state telemetry.
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={handleReset} icon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Go to Cluster
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button variant="outline" onClick={handleReset}>
              {verifySuccess ? 'Close' : 'Cancel / Close'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
