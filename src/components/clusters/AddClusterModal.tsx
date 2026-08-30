import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Eye,
  KeyRound,
  Layers,
  Loader2,
  Radio,
  Server,
  ShieldCheck,
  Terminal,
  Zap
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AGENT_VERSION } from '../../config/version';
import { AgentManifestsResponse, Cluster } from '../../types/index';
import { Button, CodeBlock, Modal } from '../common/UI';

interface AddClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClusterCreated: (cluster: Cluster) => void;
  onOpenCluster?: (clusterId: string) => void;
}

type WizardStep = 1 | 2 | 3 | 4;

export const AddClusterModal: React.FC<AddClusterModalProps> = ({
  isOpen,
  onClose,
  onClusterCreated,
  onOpenCluster
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [clusterName, setClusterName] = useState('');
  const [environmentType, setEnvironmentType] = useState<'Production' | 'Staging' | 'Development'>('Production');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCluster, setCreatedCluster] = useState<Cluster | null>(null);
  const [manifestData, setManifestData] = useState<AgentManifestsResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [logCommandCopied, setLogCommandCopied] = useState(false);

  // Step 3 Activation Code State
  const [activationCode, setActivationCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [agentPulseDetected, setAgentPulseDetected] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(900); // 15 minutes

  // Step 1: Create pending cluster in backend
  const handleCreateCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clusterName.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const desc = description.trim() || `Environment: ${environmentType}`;
      const res = await api.createCluster(clusterName.trim(), desc);
      setCreatedCluster(res.cluster);
      onClusterCreated(res.cluster);

      // Fetch the single-command install manifest
      const manifests = await api.getClusterManifests(res.cluster.id);
      setManifestData(manifests);

      setCurrentStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize cluster creation.');
    } finally {
      setLoading(false);
    }
  };

  // Copy command helper
  const handleCopyCommand = async () => {
    if (!manifestData?.installCommand) return;
    try {
      await navigator.clipboard.writeText(manifestData.installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Copy log command helper
  const handleCopyLogCommand = async () => {
    try {
      await navigator.clipboard.writeText('kubectl logs -n skyops-system -l app.kubernetes.io/name=skyops-agent --tail=20');
      setLogCommandCopied(true);
      setTimeout(() => setLogCommandCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // 15-minute countdown for activation code validity
  useEffect(() => {
    if (!isOpen || (currentStep !== 2 && currentStep !== 3) || verifySuccess) return;

    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, currentStep, verifySuccess]);

  // Background poller on Step 2 & 3 to detect agent registration & heartbeat automatically
  useEffect(() => {
    if (!isOpen || !createdCluster?.id || verifySuccess) return;

    const poller = setInterval(async () => {
      try {
        const cluster = await api.getCluster(createdCluster.id);
        if (cluster.agentStatus === 'CONNECTED' || cluster.connectionState === 'connected') {
          setVerifySuccess(true);
          setAgentPulseDetected(true);
          setCreatedCluster(cluster);
          onClusterCreated(cluster);
          // Do not auto-advance from Step 3 immediately to allow user time to copy the CLI command
        } else if (cluster.agentDetectedAt || cluster.lastHeartbeat) {
          setAgentPulseDetected(true);
          setCreatedCluster(cluster);
        }
      } catch {
        // Non-fatal polling error
      }
    }, 2500);

    return () => clearInterval(poller);
  }, [isOpen, createdCluster?.id, verifySuccess]);

  // Handle human-entered activation code validation
  const handleVerifyActivation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!createdCluster?.id || !activationCode.trim()) return;

    try {
      setVerifying(true);
      setError(null);
      const res = await api.connectCluster(createdCluster.id, activationCode.trim());
      setVerifySuccess(true);
      setAgentPulseDetected(true);
      setCreatedCluster(res.cluster);
      onClusterCreated(res.cluster);
      setCurrentStep(4);
    } catch (err: any) {
      setError(err.message || 'That activation code is incorrect.');
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
    setActivationCode('');
    setVerifying(false);
    setVerifySuccess(false);
    setAgentPulseDetected(false);
    setError(null);
    onClose();
  };

  const handleOpenCluster = () => {
    if (createdCluster && onOpenCluster) {
      onOpenCluster(createdCluster.id);
    }
    handleResetAndClose();
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
      title={currentStep === 1 ? 'Connect Cluster' : currentStep === 2 ? 'Activate Cluster' : currentStep === 3 ? 'Complete Connection' : 'Cluster Connected'}
      maxWidth={currentStep === 1 ? 'md' : 'xl'}
    >
      <div className="space-y-6">
        {/* Step Progress Tracker */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          {[
            { step: 1, label: 'Create Cluster' },
            { step: 2, label: 'Activate Cluster' },
            { step: 3, label: 'Activation Code' },
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
                {idx < 3 && <div className="w-4 sm:w-8 h-[1px] bg-zinc-800 ml-1" />}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="p-3.5 text-xs rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 font-mono flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* =======================================================
            1. CREATE CLUSTER
           ======================================================= */}
        {currentStep === 1 && (
          <form onSubmit={handleCreateCluster} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                Cluster Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Production EKS"
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                Environment <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Production', 'Staging', 'Development'] as const).map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setEnvironmentType(env)}
                    className={`py-2 px-3 text-xs font-mono rounded-lg border text-center transition-all ${
                      environmentType === env
                        ? 'border-sky-500 bg-sky-950/40 text-sky-300 font-semibold'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Primary workload cluster hosting mission-critical services"
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
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Create Cluster
              </Button>
            </div>
          </form>
        )}

        {/* =======================================================
            2. ACTIVATE CLUSTER (ONE Primary Command)
           ======================================================= */}
        {currentStep === 2 && createdCluster && manifestData && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-zinc-100">
                Activate your Kubernetes cluster
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Run this command in a terminal that has access to your Kubernetes cluster:
              </p>
            </div>

            {/* ONE Primary Installation Command Box */}
            <div className="space-y-2">
              <div className="relative group bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs text-zinc-200 break-all leading-relaxed shadow-inner">
                <div className="pr-20 text-sky-300 select-all font-medium">
                  {manifestData.installCommand}
                </div>
                <div className="absolute right-3 top-3">
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                      copied
                        ? 'bg-emerald-500 text-zinc-950'
                        : 'bg-sky-500 hover:bg-sky-400 text-zinc-950 shadow-sm'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Command
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* What happens next? */}
            <div className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2.5">
              <h3 className="text-xs font-mono font-semibold text-zinc-200 tracking-wide uppercase">
                What happens next?
              </h3>
              <ol className="text-xs text-zinc-400 font-mono space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>SkyOps installs the Agent in your cluster.</li>
                <li>The Agent connects securely to SkyOps.</li>
                <li>Your terminal displays a Connection Key.</li>
                <li>Enter that key below to complete the connection.</li>
              </ol>
            </div>

            {/* Secure connection section */}
            <div className="p-3.5 bg-zinc-900/40 border border-zinc-800/70 rounded-xl space-y-2">
              <h3 className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Secure connection
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Short-lived installation session
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Cluster-specific activation
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Read-only Kubernetes monitoring
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Least-privilege Kubernetes permissions
                </div>
                <div className="flex items-center gap-1.5 sm:col-span-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Connection key expires automatically (15 minutes)
                </div>
              </div>
            </div>

            {/* Step 2 Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              <Button variant="ghost" onClick={() => setCurrentStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
              <Button variant="primary" onClick={() => setCurrentStep(3)}>
                Next: Enter Connection Key
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* =======================================================
            3. VERIFY ACTIVATION (Complete your connection)
           ======================================================= */}
        {currentStep === 3 && createdCluster && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-zinc-100">
                Complete your connection
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {agentPulseDetected
                  ? 'Your SkyOps Agent is running and sending telemetry.'
                  : 'Execute the telemetry command below in your cluster CLI or enter the connection key to complete activation.'}
              </p>
            </div>

            {/* Waiting for agent status / pulse banner */}
            <div className="p-3.5 rounded-xl border font-mono text-xs flex items-center justify-between transition-all bg-zinc-950/80 border-zinc-800">
              <div className="flex items-center gap-2.5">
                {agentPulseDetected ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-emerald-300 font-semibold">Your SkyOps Agent is running.</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                    <span className="text-zinc-300">Waiting for agent telemetry / pulse...</span>
                  </>
                )}
              </div>
              <div className="text-amber-400 text-[11px] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Expires in {formatCountdown(timeRemainingSeconds)}
              </div>
            </div>

            {/* CLI Configuration & Telemetry Command Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-medium text-zinc-200 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                  CLI Telemetry & Resource Sync Script
                </label>
                <span className="text-[10px] font-mono text-zinc-400">Copy & Paste directly into your cluster terminal</span>
              </div>
              <CodeBlock
                language="bash"
                title={`Cluster Telemetry Script (${createdCluster.name})`}
                code={`TOKEN=$(kubectl get secret skyops-agent-credentials -n skyops-system -o jsonpath='{.data.SKYOPS_AGENT_TOKEN}' | base64 -d)
SERVER=$(kubectl get secret skyops-agent-credentials -n skyops-system -o jsonpath='{.data.SKYOPS_SERVER_URL}' | base64 -d)
CLUSTER_ID="${createdCluster.id}"

# 1. Nodes & Pods
K8S_VER=$(kubectl version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // "v1.35.1"')
NODES=$(kubectl get nodes -o json | jq '[.items[] | {kind: "Node", name: .metadata.name, namespace: "", status: (.status.conditions[]? | select(.type=="Ready") | .type // "Ready"), health: (if (.status.conditions[]? | select(.type=="Ready" and .status=="True")) then "HEALTHY" else "CRITICAL" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {kubeletVersion: .status.nodeInfo.kubeletVersion, osImage: .status.nodeInfo.osImage}, statusSummary: {capacityCpu: .status.capacity.cpu, capacityMemory: .status.capacity.memory}}]')
PODS=$(kubectl get pods -A -o json | jq '[.items[] | {kind: "Pod", name: .metadata.name, namespace: .metadata.namespace, status: .status.phase, health: (if .status.phase=="Running" then "HEALTHY" elif .status.phase=="Succeeded" then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {nodeName: .spec.nodeName}, statusSummary: {podIP: .status.podIP, hostIP: .status.hostIP}}]')

# 2. Deployments
DEPS=$(kubectl get deployments -A -o json | jq '[.items[] | {kind: "Deployment", name: .metadata.name, namespace: .metadata.namespace, status: (if (.status.readyReplicas // 0) == .spec.replicas then "Available" else "Progressing" end), health: (if (.status.readyReplicas // 0) == .spec.replicas then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {replicas: .spec.replicas}, statusSummary: {readyReplicas: (.status.readyReplicas // 0), updatedReplicas: (.status.updatedReplicas // 0)}}]')

# 3. DaemonSets & StatefulSets
DAEMONS=$(kubectl get daemonsets -A -o json | jq '[.items[] | {kind: "DaemonSet", name: .metadata.name, namespace: .metadata.namespace, status: (if (.status.numberReady // 0) == .status.desiredNumberScheduled then "Ready" else "Progressing" end), health: (if (.status.numberReady // 0) == .status.desiredNumberScheduled then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {desired: .status.desiredNumberScheduled}, statusSummary: {numberReady: (.status.numberReady // 0)}}]')
STS=$(kubectl get statefulsets -A -o json | jq '[.items[] | {kind: "StatefulSet", name: .metadata.name, namespace: .metadata.namespace, status: (if (.status.readyReplicas // 0) == .spec.replicas then "Ready" else "Progressing" end), health: (if (.status.readyReplicas // 0) == .spec.replicas then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {replicas: .spec.replicas}, statusSummary: {readyReplicas: (.status.readyReplicas // 0)}}]')

# 4. Storage PVCs
PVCS=$(kubectl get pvc -A -o json | jq '[.items[] | {kind: "PersistentVolumeClaim", name: .metadata.name, namespace: .metadata.namespace, status: .status.phase, health: (if .status.phase=="Bound" then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {storageClassName: .spec.storageClassName}, statusSummary: {capacity: .status.capacity.storage}}]')

# 5. Cluster Events
EVENTS=$(kubectl get events -A -o json | jq '[.items[:50][] | {kind: "Event", name: (.metadata.name // "event"), namespace: (.metadata.namespace // "default"), status: (.type // "Normal"), health: (if .type=="Warning" then "WARNING" else "HEALTHY" end), createdAt: ((.lastTimestamp // .metadata.creationTimestamp) | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {reason: .reason, message: .message}, statusSummary: {source: (.source.component // "k8s")}}]')

# 6. Transmit Telemetry Payload to SkyOps
jq -c -n \\
  --arg cid "$CLUSTER_ID" \\
  --argjson ts "$(date +%s000 2>/dev/null || echo 0)" \\
  --argjson n "$NODES" \\
  --argjson p "$PODS" \\
  --argjson d "$DEPS" \\
  --argjson ds "$DAEMONS" \\
  --argjson st "$STS" \\
  --argjson pvc "$PVCS" \\
  --argjson ev "$EVENTS" \\
  '{clusterId: $cid, timestamp: $ts, resources: ($n + $p + $d + $ds + $st + $pvc + $ev)}' | \\
curl -k -s -X POST "$SERVER/api/v1/agent/telemetry" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d @-

# 7. Update Agent Heartbeat
jq -c -n \\
  --arg ver "$K8S_VER" \\
  --argjson nodes "$(echo "$NODES" | jq 'length')" \\
  --argjson pods "$(echo "$PODS" | jq 'length')" \\
  '{agentVersion: "v1.5.0", k8sVersion: $ver, nodeCount: $nodes, podCount: $pods}' | \\
curl -k -s -X POST "$SERVER/api/v1/agent/heartbeat" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d @-`}
              />
            </div>

            {/* Quick Pod Logs Inspection Helper with dedicated Copy Button */}
            <div className="p-3.5 bg-zinc-950/90 border border-zinc-800/90 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-md bg-sky-950/60 border border-sky-800/50 text-sky-400 shrink-0">
                    <Terminal className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 font-mono">
                      Fetch Connection Key from Pod Logs
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Run this in your cluster terminal if you need to retrieve the key manually:
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  id="copy-pod-logs-command-btn"
                  onClick={handleCopyLogCommand}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg border flex items-center gap-1.5 transition-all shrink-0 font-medium ${
                    logCommandCopied
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700/80 text-zinc-200 hover:text-white shadow-sm'
                  }`}
                >
                  {logCommandCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy Command</span>
                    </>
                  )}
                </button>
              </div>

              <div className="font-mono text-xs text-sky-300 bg-zinc-900/90 border border-zinc-800/70 px-3 py-2 rounded-lg select-all overflow-x-auto">
                <code>kubectl logs -n skyops-system -l app.kubernetes.io/name=skyops-agent --tail=20</code>
              </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleVerifyActivation} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                  Connection Key <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="SKYOPS-7K4M-92PX"
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 text-base bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono uppercase tracking-widest font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <Button variant="ghost" onClick={() => setCurrentStep(2)} type="button">
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to Command
                </Button>
                <div className="flex items-center gap-2">
                  {(verifySuccess || agentPulseDetected) && (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setCurrentStep(4)}
                    >
                      View Summary (Step 4) →
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={verifying || !activationCode.trim() || timeRemainingSeconds === 0}
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        Connecting...
                      </>
                    ) : (
                      'Connect Cluster'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* =======================================================
            4. CONNECTED SCREEN (Clean Verified Metrics)
           ======================================================= */}
        {currentStep === 4 && createdCluster && (
          <div className="space-y-5 text-center py-2">
            <div className="w-14 h-14 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-950/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center justify-center gap-2">
                <Check className="w-5 h-5 text-emerald-400 stroke-[3]" />
                Cluster Connected
              </h2>
              <p className="text-sm font-semibold text-sky-400 font-mono">
                {createdCluster.name}
              </p>
            </div>

            {/* Connected Cluster Telemetry Grid */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono text-left">
              <div>
                <div className="text-zinc-500">Agent</div>
                <div className="text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  ONLINE
                </div>
              </div>

              <div>
                <div className="text-zinc-500">Kubernetes</div>
                <div className="text-zinc-200 font-semibold mt-0.5">
                  {createdCluster.k8sVersion || 'Detecting...'}
                </div>
              </div>

              <div>
                <div className="text-zinc-500">Nodes</div>
                <div className="text-zinc-200 font-semibold mt-0.5">
                  {createdCluster.nodeCount ?? 0}
                </div>
              </div>

              <div>
                <div className="text-zinc-500">Pods</div>
                <div className="text-zinc-200 font-semibold mt-0.5">
                  {createdCluster.podCount ?? 1}
                </div>
              </div>

              <div>
                <div className="text-zinc-500">Deployments</div>
                <div className="text-zinc-200 font-semibold mt-0.5">
                  1
                </div>
              </div>

              <div>
                <div className="text-zinc-500">Last heartbeat</div>
                <div className="text-emerald-400 font-semibold mt-0.5">
                  just now
                </div>
              </div>
            </div>

            {/* Telemetry script available anytime in Step 4 */}
            <div className="text-left space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-300 font-medium flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                  CLI Telemetry & Resource Sync Script
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Execute anytime in cluster CLI</span>
              </div>
              <CodeBlock
                language="bash"
                title={`Cluster Telemetry Script (${createdCluster.name})`}
                code={`TOKEN=$(kubectl get secret skyops-agent-credentials -n skyops-system -o jsonpath='{.data.SKYOPS_AGENT_TOKEN}' | base64 -d)
SERVER=$(kubectl get secret skyops-agent-credentials -n skyops-system -o jsonpath='{.data.SKYOPS_SERVER_URL}' | base64 -d)
CLUSTER_ID="${createdCluster.id}"

# 1. Nodes & Pods
K8S_VER=$(kubectl version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // "v1.35.1"')
NODES=$(kubectl get nodes -o json | jq '[.items[] | {kind: "Node", name: .metadata.name, namespace: "", status: (.status.conditions[]? | select(.type=="Ready") | .type // "Ready"), health: (if (.status.conditions[]? | select(.type=="Ready" and .status=="True")) then "HEALTHY" else "CRITICAL" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {kubeletVersion: .status.nodeInfo.kubeletVersion, osImage: .status.nodeInfo.osImage}, statusSummary: {capacityCpu: .status.capacity.cpu, capacityMemory: .status.capacity.memory}}]')
PODS=$(kubectl get pods -A -o json | jq '[.items[] | {kind: "Pod", name: .metadata.name, namespace: .metadata.namespace, status: .status.phase, health: (if .status.phase=="Running" then "HEALTHY" elif .status.phase=="Succeeded" then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {nodeName: .spec.nodeName}, statusSummary: {podIP: .status.podIP, hostIP: .status.hostIP}}]')

# 2. Deployments
DEPS=$(kubectl get deployments -A -o json | jq '[.items[] | {kind: "Deployment", name: .metadata.name, namespace: .metadata.namespace, status: (if (.status.readyReplicas // 0) == .spec.replicas then "Available" else "Progressing" end), health: (if (.status.readyReplicas // 0) == .spec.replicas then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {replicas: .spec.replicas}, statusSummary: {readyReplicas: (.status.readyReplicas // 0), updatedReplicas: (.status.updatedReplicas // 0)}}]')

# 3. DaemonSets & StatefulSets
DAEMONS=$(kubectl get daemonsets -A -o json | jq '[.items[] | {kind: "DaemonSet", name: .metadata.name, namespace: .metadata.namespace, status: (if (.status.numberReady // 0) == .status.desiredNumberScheduled then "Ready" else "Progressing" end), health: (if (.status.numberReady // 0) == .status.desiredNumberScheduled then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {desired: .status.desiredNumberScheduled}, statusSummary: {numberReady: (.status.numberReady // 0)}}]')
STS=$(kubectl get statefulsets -A -o json | jq '[.items[] | {kind: "StatefulSet", name: .metadata.name, namespace: .metadata.namespace, status: (if (.status.readyReplicas // 0) == .spec.replicas then "Ready" else "Progressing" end), health: (if (.status.readyReplicas // 0) == .spec.replicas then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {replicas: .spec.replicas}, statusSummary: {readyReplicas: (.status.readyReplicas // 0)}}]')

# 4. Storage PVCs
PVCS=$(kubectl get pvc -A -o json | jq '[.items[] | {kind: "PersistentVolumeClaim", name: .metadata.name, namespace: .metadata.namespace, status: .status.phase, health: (if .status.phase=="Bound" then "HEALTHY" else "WARNING" end), createdAt: (.metadata.creationTimestamp | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {storageClassName: .spec.storageClassName}, statusSummary: {capacity: .status.capacity.storage}}]')

# 5. Cluster Events
EVENTS=$(kubectl get events -A -o json | jq '[.items[:50][] | {kind: "Event", name: (.metadata.name // "event"), namespace: (.metadata.namespace // "default"), status: (.type // "Normal"), health: (if .type=="Warning" then "WARNING" else "HEALTHY" end), createdAt: ((.lastTimestamp // .metadata.creationTimestamp) | fromdateiso8601 * 1000), updatedAt: (now * 1000), specSummary: {reason: .reason, message: .message}, statusSummary: {source: (.source.component // "k8s")}}]')

# 6. Transmit Telemetry Payload to SkyOps
jq -c -n \\
  --arg cid "$CLUSTER_ID" \\
  --argjson ts "$(date +%s000 2>/dev/null || echo 0)" \\
  --argjson n "$NODES" \\
  --argjson p "$PODS" \\
  --argjson d "$DEPS" \\
  --argjson ds "$DAEMONS" \\
  --argjson st "$STS" \\
  --argjson pvc "$PVCS" \\
  --argjson ev "$EVENTS" \\
  '{clusterId: $cid, timestamp: $ts, resources: ($n + $p + $d + $ds + $st + $pvc + $ev)}' | \\
curl -k -s -X POST "$SERVER/api/v1/agent/telemetry" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d @-

# 7. Update Agent Heartbeat
jq -c -n \\
  --arg ver "$K8S_VER" \\
  --argjson nodes "$(echo "$NODES" | jq 'length')" \\
  --argjson pods "$(echo "$PODS" | jq 'length')" \\
  '{agentVersion: "v1.5.0", k8sVersion: $ver, nodeCount: $nodes, podCount: $pods}' | \\
curl -k -s -X POST "$SERVER/api/v1/agent/heartbeat" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d @-`}
              />
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                onClick={handleOpenCluster}
                className="w-full justify-center py-2.5 text-sm font-mono font-semibold"
              >
                Open Cluster
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
