import {
  AlertTriangle,
  ArrowLeft,
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
  X,
  Zap
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

type WizardStep = 1 | 2 | 3 | 4;

export const AddClusterModal: React.FC<AddClusterModalProps> = ({ isOpen, onClose, onClusterCreated }) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [clusterName, setClusterName] = useState('');
  const [description, setDescription] = useState('');
  const [environmentType, setEnvironmentType] = useState<'production' | 'staging' | 'development'>('production');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCluster, setCreatedCluster] = useState<Cluster | null>(null);
  const [manifestData, setManifestData] = useState<AgentManifestsResponse | null>(null);
  const [installMethod, setInstallMethod] = useState<'helm' | 'kubectl'>('helm');

  // Step 3 Pairing Key states
  const [inputConnectionCode, setInputConnectionCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [agentPulseDetected, setAgentPulseDetected] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(900); // 15 minutes

  // Step 1: Create pending cluster record
  const handleCreateCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clusterName.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.createCluster(clusterName.trim(), description.trim());
      setCreatedCluster(res.cluster);
      onClusterCreated(res.cluster);

      // Fetch manifests & connection keys
      const manifests = await api.getClusterManifests(res.cluster.id);
      setManifestData(manifests);
      if (manifests.connectionCode) {
        setInputConnectionCode(manifests.connectionCode);
      }

      setCurrentStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize cluster registration');
    } finally {
      setLoading(false);
    }
  };

  // 15-minute countdown for connection key validity
  useEffect(() => {
    if (!isOpen || currentStep !== 3 || verifySuccess) return;

    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, currentStep, verifySuccess]);

  // Background poller on Step 3 to auto-detect agent registration
  useEffect(() => {
    if (!isOpen || currentStep !== 3 || !createdCluster?.id || verifySuccess) return;

    const poller = setInterval(async () => {
      try {
        const cluster = await api.getCluster(createdCluster.id);
        if (cluster.agentStatus === 'CONNECTED' || cluster.connectionState === 'connected') {
          setVerifySuccess(true);
          setAgentPulseDetected(true);
          setCreatedCluster(cluster);
          onClusterCreated(cluster);
          setTimeout(() => {
            setCurrentStep(4);
          }, 800);
        } else if (cluster.agentDetectedAt) {
          setAgentPulseDetected(true);
        }
      } catch {
        // non-fatal polling error
      }
    }, 3000);

    return () => clearInterval(poller);
  }, [isOpen, currentStep, createdCluster?.id, verifySuccess]);

  // Manual Connection Key verification
  const handleVerifyPairingKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!createdCluster?.id || !inputConnectionCode.trim()) return;

    try {
      setVerifying(true);
      setError(null);
      const res = await api.connectCluster(createdCluster.id, inputConnectionCode.trim());
      setVerifySuccess(true);
      setAgentPulseDetected(true);
      setCreatedCluster(res.cluster);
      onClusterCreated(res.cluster);
      setCurrentStep(4);
    } catch (err: any) {
      setError(err.message || 'Failed to verify pairing key. Please check the terminal output.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResetAndClose = () => {
    setCurrentStep(1);
    setClusterName('');
    setDescription('');
    setCreatedCluster(null);
    setManifestData(null);
    setInputConnectionCode('');
    setVerifying(false);
    setVerifySuccess(false);
    setAgentPulseDetected(false);
    setError(null);
    onClose();
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleResetAndClose}
      title="Connect Kubernetes Cluster"
      maxWidth={currentStep === 1 ? 'md' : 'xl'}
    >
      <div className="space-y-6">
        {/* Step Progress Indicator */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          {[
            { step: 1, label: 'Cluster Details' },
            { step: 2, label: 'Install Agent' },
            { step: 3, label: 'Verify Key' },
            { step: 4, label: 'Connected' }
          ].map((item, idx) => {
            const isCompleted = currentStep > item.step || (item.step === 4 && verifySuccess);
            const isCurrent = currentStep === item.step;
            return (
              <div key={item.step} className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-zinc-950'
                      : isCurrent
                      ? 'bg-sky-500 text-zinc-950 ring-4 ring-sky-950'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : item.step}
                </div>
                <span
                  className={`text-xs font-mono hidden sm:inline ${
                    isCurrent ? 'text-zinc-100 font-semibold' : 'text-zinc-500'
                  }`}
                >
                  {item.label}
                </span>
                {idx < 3 && <div className="w-6 sm:w-10 h-[1px] bg-zinc-800 ml-1 sm:ml-2" />}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="p-3.5 text-xs rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 font-mono flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* STEP 1: Cluster Details */}
        {currentStep === 1 && (
          <form onSubmit={handleCreateCluster} className="space-y-4">
            <div className="text-xs text-zinc-400 leading-relaxed">
              Register a target Kubernetes cluster with SkyOps. You will be provided with production Helm charts and a single-use pairing key to authenticate the agent.
            </div>

            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
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
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">Environment Tag</label>
              <div className="grid grid-cols-3 gap-2">
                {(['production', 'staging', 'development'] as const).map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setEnvironmentType(env)}
                    className={`py-2 px-3 text-xs font-mono rounded-lg border text-center capitalize transition-all ${
                      environmentType === env
                        ? 'border-sky-500 bg-sky-950/30 text-sky-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">Description (Optional)</label>
              <textarea
                rows={2}
                placeholder="Primary workload cluster hosting customer-facing microservices"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button variant="ghost" onClick={handleResetAndClose} type="button">
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={loading || !clusterName.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Next: Configure Agent'}
              </Button>
            </div>
          </form>
        )}

        {/* STEP 2: Install Agent */}
        {currentStep === 2 && createdCluster && manifestData && (
          <div className="space-y-5">
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <div className="text-zinc-500">Cluster ID</div>
                <div className="text-zinc-200 font-semibold truncate">{createdCluster.id}</div>
              </div>
              <div>
                <div className="text-zinc-500">Namespace</div>
                <div className="text-zinc-200 font-semibold">{manifestData.namespace || 'skyops-system'}</div>
              </div>
              <div>
                <div className="text-zinc-500">RBAC Scope</div>
                <div className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Read-Only (Non-Admin)
                </div>
              </div>
            </div>

            {/* Install method toggle */}
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
              <button
                type="button"
                onClick={() => setInstallMethod('helm')}
                className={`text-xs font-mono px-3 py-1.5 rounded-lg font-medium transition-all ${
                  installMethod === 'helm'
                    ? 'bg-zinc-800 text-sky-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Helm 3 (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setInstallMethod('kubectl')}
                className={`text-xs font-mono px-3 py-1.5 rounded-lg font-medium transition-all ${
                  installMethod === 'kubectl'
                    ? 'bg-zinc-800 text-sky-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Kubectl Apply
              </button>
            </div>

            {installMethod === 'helm' ? (
              <div className="space-y-3">
                <div className="text-xs text-zinc-300">
                  Execute the following Helm command in your terminal configured with <code className="text-sky-400 font-mono">kubeconfig</code>:
                </div>
                <CodeBlock code={manifestData.helmCommand} language="bash" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-zinc-300">
                  Deploy the SkyOps Agent daemon using a direct manifest stream:
                </div>
                <CodeBlock code={manifestData.installCommand} language="bash" />
                <div className="flex justify-end">
                  <a
                    href={manifestData.manifestDownloadUrl}
                    download={`skyops-agent-${createdCluster.id}.yaml`}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download raw YAML manifest
                  </a>
                </div>
              </div>
            )}

            {/* RBAC Security Note */}
            <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl text-[11px] font-mono text-zinc-400 space-y-1">
              <div className="text-zinc-200 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Security & Least Privilege Guarantee
              </div>
              <div>
                SkyOps Agent runs as unprivileged user <code className="text-zinc-300">UID 65532</code> with a read-only root filesystem. It only observes metadata (Pods, Nodes, Deployments, Events) and cannot execute commands or alter cluster state.
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              <Button variant="ghost" onClick={() => setCurrentStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
              <Button variant="primary" onClick={() => setCurrentStep(3)}>
                Next: Verify Pairing Key
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Verify Pairing Key */}
        {currentStep === 3 && createdCluster && (
          <div className="space-y-5">
            <div className="p-4 bg-sky-950/20 border border-sky-900/50 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-sky-300 font-semibold flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  Terminal Pairing Handshake
                </span>
                <span className="text-amber-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Expires in {formatCountdown(timeRemainingSeconds)}
                </span>
              </div>
              <div className="text-xs text-zinc-300 leading-relaxed">
                When the agent container boots up, it detects the cluster and prints a single-use Connection Key to stdout. Inspect the agent logs or enter the pairing code below:
              </div>
              <CodeBlock
                code={`kubectl logs -n ${manifestData?.namespace || 'skyops-system'} -l app.kubernetes.io/name=skyops-agent --tail=20`}
                language="bash"
              />
            </div>

            <form onSubmit={handleVerifyPairingKey} className="space-y-3">
              <div>
                <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                  Connection Key <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. SKYOPS-7K4M-92PX"
                    value={inputConnectionCode}
                    onChange={(e) => setInputConnectionCode(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono uppercase tracking-wider"
                  />
                </div>
              </div>

              {agentPulseDetected && (
                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800 text-emerald-300 text-xs font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Agent pulse detected! Finalizing cluster registration...</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <Button variant="ghost" onClick={() => setCurrentStep(2)} type="button">
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to Manifest
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={verifying || !inputConnectionCode.trim() || timeRemainingSeconds === 0}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      Verifying Pairing Key...
                    </>
                  ) : (
                    'Verify & Link Cluster'
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 4: Connected Success */}
        {currentStep === 4 && createdCluster && (
          <div className="space-y-6 text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-950/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-semibold text-zinc-100">
                Kubernetes Cluster Successfully Connected!
              </h3>
              <p className="text-xs text-zinc-400 font-mono">
                Cluster <strong className="text-sky-400">{createdCluster.name}</strong> is now securely authenticated and transmitting telemetry.
              </p>
            </div>

            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl grid grid-cols-3 gap-2 text-xs font-mono text-left">
              <div>
                <div className="text-zinc-500">Status</div>
                <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  ONLINE
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Agent Version</div>
                <div className="text-zinc-200 font-semibold">{createdCluster.agentVersion || 'v1.4.2'}</div>
              </div>
              <div>
                <div className="text-zinc-500">Pairing Security</div>
                <div className="text-emerald-400 font-semibold">Key Consumed</div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                onClick={handleResetAndClose}
                className="w-full justify-center"
              >
                Go to Cluster Dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
