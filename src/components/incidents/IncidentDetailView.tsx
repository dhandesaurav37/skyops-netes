import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  HelpCircle,
  Info,
  Layers,
  MessageSquare,
  RefreshCw,
  Send,
  Server,
  Shield,
  Tag,
  Trash2,
  User,
  UserCheck,
  XCircle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Incident,
  IncidentNote,
  IncidentSeverity,
  IncidentStatus,
  SkyOpsAIAnalysis,
  StructuredRemediation,
  TimelineEvent
} from '../../types/index';
import { formatDuration, formatReportDate, generateIncidentPdf, getPriorityLabel } from '../../utils/incidentPdfGenerator';
import { SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, CodeBlock, CopyButton, EmptyState, LoadingState } from '../common/UI';
import { SkyOpsAIAnalysisCard } from './SkyOpsAIAnalysisCard';

interface IncidentDetailViewProps {
  incidentId: string;
  onBack: () => void;
  onSelectCluster?: (clusterId: string) => void;
}

export const IncidentDetailView: React.FC<IncidentDetailViewProps> = ({
  incidentId,
  onBack,
  onSelectCluster
}) => {
  const { canEditIncidents, members } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<IncidentNote[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<SkyOpsAIAnalysis | null>(null);
  const [remediation, setRemediation] = useState<StructuredRemediation | null>(null);
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);

  const fetchIncidentData = async () => {
    try {
      setLoading(true);
      const data = await api.getIncident(incidentId);
      setIncident(data.incident);
      setTimeline(data.timeline);
      setNotes(data.notes);
      if (data.aiAnalysis) {
        setAiAnalysis(data.aiAnalysis);
      }
      if (data.remediation) {
        setRemediation(data.remediation);
      }
    } catch (err) {
      console.error('Failed to fetch incident details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidentData();
  }, [incidentId]);

  const handleDownloadPdf = () => {
    if (!incident) return;
    try {
      setIsGeneratingPdf(true);
      generateIncidentPdf({ incident, timeline, notes });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate incident PDF report:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDelete = async () => {
    if (!incident || !canEditIncidents) return;
    if (!window.confirm(`Are you sure you want to delete incident ticket ${incident.id}?`)) return;
    try {
      setIsDeleting(true);
      await api.deleteIncident(incident.id);
      onBack();
    } catch (err) {
      console.error('Failed to delete incident:', err);
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: IncidentStatus) => {
    if (!incident || !canEditIncidents) return;
    try {
      setStatusUpdateLoading(true);
      const updated = await api.updateIncident(incident.id, { status: newStatus });
      setIncident(updated);
      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleSeverityChange = async (newSeverity: IncidentSeverity) => {
    if (!incident || !canEditIncidents) return;
    try {
      setStatusUpdateLoading(true);
      const updated = await api.updateIncident(incident.id, { severity: newSeverity });
      setIncident(updated);
      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err) {
      console.error('Failed to update severity:', err);
    } finally {
      setStatusUpdateLoading(false);
    }
  };

  const handleAssigneeChange = async (userId: string) => {
    if (!incident || !canEditIncidents) return;
    const member = members.find((m) => m.userId === userId);
    try {
      const assignee = member ? { userId: member.userId, name: member.name, email: member.email } : undefined;
      const updated = await api.updateIncident(incident.id, { assignee });
      setIncident(updated);
      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err) {
      console.error('Failed to assign incident:', err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !incident || !canEditIncidents) return;

    try {
      setIsSubmittingNote(true);
      const note = await api.addIncidentNote(incident.id, newNoteContent.trim());
      setNotes((prev) => [...prev, note]);
      setNewNoteContent('');

      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setIsSubmittingNote(false);
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

  if (loading && !incident) {
    return <LoadingState message="Loading incident ticket..." />;
  }

  if (!incident) {
    return (
      <div className="p-8">
        <EmptyState
          title="Incident Not Found"
          description="The requested incident ticket could not be found."
          action={{ label: 'Return to Incidents', onClick: onBack }}
        />
      </div>
    );
  }

  const tech = incident.technicalDetails || {};
  const priority = getPriorityLabel(incident.severity);

  // Executive Summary data points
  const whatHappened = tech.message || `Kubernetes failure state '${incident.incidentType}' observed on ${incident.resourceKind} ${incident.resourceName}.`;
  const whereItHappened = `${incident.clusterName} (Namespace: ${incident.namespace}) > ${incident.resourceKind}/${incident.resourceName}`;
  const whyDetected = tech.reason ? `Kubelet telemetry detected status/condition reason: '${tech.reason}'.` : `Deterministic rule engine matched failure criteria for ${incident.incidentType}.`;
  const currentImpact = tech.impact || (incident.severity === 'CRITICAL' || incident.severity === 'HIGH' ? 'Workload is unavailable or degraded, failing readiness checks.' : 'Localized component degradation without total cluster outage.');
  const evidenceSummary = tech.rootCause || 'Under deterministic observation via container runtime status and Kubernetes events.';

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Top Bar with Back Action, Ticket Identity & Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-start sm:items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 mt-0.5 sm:mt-0"
            title="Back to Incidents List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold font-mono text-sky-400">{incident.id}</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                {priority}
              </span>
              <SeverityBadge severity={incident.severity} size="sm" />
              <StatusBadge status={incident.status} size="sm" />
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                {incident.occurrenceCount}x Occurrence{incident.occurrenceCount > 1 ? 's' : ''}
              </span>
            </div>
            <h1 className="text-base font-semibold text-zinc-100 mt-1 leading-snug">{incident.title}</h1>
          </div>
        </div>

        {/* Global Ticket Actions Bar */}
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
          {/* Download PDF Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            icon={isGeneratingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            className="bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-xs"
          >
            {pdfSuccess ? 'Report Downloaded!' : isGeneratingPdf ? 'Generating PDF...' : 'Download PDF Report'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchIncidentData}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>

          {/* Quick Status Dropdown */}
          {canEditIncidents && (
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <span className="text-zinc-500 text-[11px] uppercase">Status:</span>
              <select
                value={incident.status}
                disabled={statusUpdateLoading}
                onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
                className="bg-transparent text-zinc-200 focus:outline-none font-semibold cursor-pointer"
              >
                <option value="OPEN" className="bg-zinc-900 text-zinc-200">OPEN</option>
                <option value="ACKNOWLEDGED" className="bg-zinc-900 text-zinc-200">ACKNOWLEDGED</option>
                <option value="IN_PROGRESS" className="bg-zinc-900 text-zinc-200">IN_PROGRESS</option>
                <option value="RESOLVED" className="bg-zinc-900 text-zinc-200">RESOLVED</option>
                <option value="CLOSED" className="bg-zinc-900 text-zinc-200">CLOSED</option>
              </select>
            </div>
          )}

          {canEditIncidents && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
              className="hover:border-rose-800 text-rose-300"
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* --- EXECUTIVE INCIDENT SUMMARY CARD --- */}
      <div className="p-5 rounded-xl bg-linear-to-br from-zinc-900/90 via-zinc-900/60 to-zinc-950 border border-sky-900/40 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-400" />
            <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">
              Executive Incident Summary & Impact
            </h2>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Detected {formatTimeAgo(incident.firstSeenAt)} • Last pulse {formatTimeAgo(incident.lastSeenAt)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800/70 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-sky-400 flex items-center gap-1.5">
              <AlertOctagon className="w-3 h-3" />
              What Happened
            </span>
            <p className="text-zinc-200 text-xs leading-relaxed">{whatHappened}</p>
          </div>

          <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800/70 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-sky-400 flex items-center gap-1.5">
              <Server className="w-3 h-3" />
              Where It Happened
            </span>
            <p className="text-zinc-200 text-xs leading-relaxed font-mono truncate">{whereItHappened}</p>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              Node: {tech.nodeName || 'Not available'}
            </div>
          </div>

          <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800/70 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-sky-400 flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              Why SkyOps Detected It
            </span>
            <p className="text-zinc-200 text-xs leading-relaxed">{whyDetected}</p>
          </div>

          <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800/70 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Current Impact / State
            </span>
            <p className="text-zinc-200 text-xs leading-relaxed">{currentImpact}</p>
          </div>

          <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800/70 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 flex items-center gap-1.5">
              <Shield className="w-3 h-3" />
              Investigation Evidence
            </span>
            <p className="text-zinc-200 text-xs leading-relaxed">{evidenceSummary}</p>
          </div>

          <div className="p-3 bg-zinc-950/80 rounded-lg border border-zinc-800/70 space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-purple-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Recommended Action
            </span>
            <p className="text-zinc-200 text-xs leading-relaxed">{tech.recommendedAction || tech.recommendation || 'Inspect pod logs and manifest configuration.'}</p>
          </div>
        </div>
      </div>

      {/* --- SKYOPS AI REASONING & REMEDIATION INTELLIGENCE LAYER --- */}
      <SkyOpsAIAnalysisCard
        incidentId={incident.id}
        initialAnalysis={aiAnalysis}
        initialRemediation={remediation}
        canEdit={canEditIncidents}
        onRemediationApplied={fetchIncidentData}
      />

      {/* --- TWO COLUMN SERVICENOW TICKET LAYOUT --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Incident Classification, Infrastructure Target, Failure Telemetry & Container States */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section 1: Incident Classification & Lifecycle Timestamps */}
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Tag className="w-4 h-4 text-sky-400" />
              1. Incident Identification & ITIL Classification
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Ticket ID</span>
                <span className="text-sky-400 font-bold">{incident.id}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Incident Classification</span>
                <span className="text-zinc-200 font-semibold">{incident.incidentType}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">RCA Category / Confidence</span>
                <span className="text-zinc-200 font-semibold">{tech.rootCauseCategory || 'UNDETERMINED'} / {tech.confidence || 'LOW'}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">ITIL / SRE Priority</span>
                <span className="text-zinc-200 font-bold">{priority}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Severity</span>
                <span className="text-zinc-200 font-semibold">{incident.severity}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Lifecycle Status</span>
                <span className="text-zinc-200 font-semibold">{incident.status}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Occurrence Count</span>
                <span className="text-amber-400 font-bold">
                  {incident.occurrenceCount}x {incident.occurrenceCount === 1 ? '(Initial)' : `(Recurred ${incident.occurrenceCount - 1}x)`}
                </span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">First Detected</span>
                <span className="text-zinc-300 truncate block" title={formatReportDate(incident.firstSeenAt)}>
                  {formatReportDate(incident.firstSeenAt)}
                </span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Last Observed Pulse</span>
                <span className="text-zinc-300 truncate block" title={formatReportDate(incident.lastSeenAt)}>
                  {formatReportDate(incident.lastSeenAt)}
                </span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Resolved Timestamp</span>
                <span className="text-zinc-300 truncate block">
                  {incident.resolvedAt ? formatReportDate(incident.resolvedAt) : 'Not resolved'}
                </span>
              </div>
            </div>

            {incident.resolvedAt && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-900/60 rounded-lg font-mono text-xs flex items-center justify-between text-emerald-300">
                <span>Incident Duration / Mean Time to Recovery:</span>
                <span className="font-bold">{formatDuration(incident.firstSeenAt, incident.resolvedAt)}</span>
              </div>
            )}
          </div>

          {/* Rule-based RCA uses already collected Kubernetes status and events. */}
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Shield className="w-4 h-4 text-emerald-400" />
              Root Cause Intelligence
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70"><span className="text-zinc-500 text-[10px] block uppercase">Root Cause</span><p className="text-zinc-200 mt-1">{tech.rootCause || 'Root cause undetermined'}</p></div>
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70"><span className="text-zinc-500 text-[10px] block uppercase">Impact</span><p className="text-zinc-200 mt-1">{tech.impact || 'Impact is still being determined.'}</p></div>
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70 sm:col-span-2"><span className="text-zinc-500 text-[10px] block uppercase">Recommended Action</span><p className="text-zinc-200 mt-1">{tech.recommendedAction || tech.recommendation || 'Inspect current Kubernetes status and events.'}</p></div>
            </div>
            <div><span className="text-zinc-500 text-[10px] block uppercase mb-2">Evidence</span><ul className="space-y-1.5 text-xs text-zinc-300">{(tech.evidence || []).map((item, index) => <li key={index} className="flex gap-2"><span className="text-sky-400">•</span><span>{item.message}</span></li>)}</ul></div>
          </div>

          {/* Section 2: Kubernetes Target Infrastructure */}
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Server className="w-4 h-4 text-sky-400" />
              2. Kubernetes Target Infrastructure
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Cluster Name</span>
                <span
                  onClick={() => onSelectCluster && onSelectCluster(incident.clusterId)}
                  className="text-sky-400 font-semibold truncate block hover:underline cursor-pointer"
                >
                  {incident.clusterName}
                </span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Namespace</span>
                <span className="text-zinc-200 font-semibold truncate block">{incident.namespace}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Resource Target</span>
                <span className="text-zinc-200 font-semibold truncate block">
                  {incident.resourceKind}/{incident.resourceName}
                </span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Pod Name</span>
                <span className="text-zinc-200 truncate block">{tech.podName || incident.resourceName}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Target Container</span>
                <span className="text-zinc-200 truncate block">{tech.containerName || 'Not available'}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Observed Node</span>
                <span className="text-zinc-200 truncate block">{tech.nodeName || 'Not available'}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70 sm:col-span-2">
                <span className="text-zinc-500 text-[10px] block uppercase">Container Image</span>
                <span className="text-zinc-300 truncate block font-mono text-[11px]">
                  {tech.image || 'Not available'}
                </span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Resource UID</span>
                <span className="text-zinc-400 truncate block font-mono text-[11px]">
                  {tech.resourceUid ? `${tech.resourceUid.slice(0, 16)}...` : 'Not available'}
                </span>
              </div>
            </div>

            {/* Deterministic Fingerprint Strip */}
            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70 flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500 text-[10px] uppercase">Deterministic Fingerprint:</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-[11px]">
                  {incident.fingerprint}
                </span>
                <CopyButton text={incident.fingerprint} />
              </div>
            </div>
          </div>

          {/* Section 3: Diagnostic Telemetry & Reason */}
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Layers className="w-4 h-4 text-sky-400" />
              3. Diagnostic Telemetry & Observed State
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Reason</span>
                <span className="text-rose-400 font-bold">{tech.reason || incident.incidentType}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Observed State</span>
                <span className="text-zinc-200 font-semibold">{tech.observedState || incident.status}</span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Exit Code</span>
                <span className="text-rose-400 font-bold">
                  {tech.exitCode !== undefined ? tech.exitCode : 'Not available'}
                </span>
              </div>

              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70">
                <span className="text-zinc-500 text-[10px] block uppercase">Restart Count</span>
                <span className="text-rose-400 font-bold">
                  {tech.restartCount !== undefined ? `${tech.restartCount} restarts` : 'Not available'}
                </span>
              </div>
            </div>

            {/* Diagnostic Message Callout */}
            {tech.message && (
              <div className="p-4 bg-rose-950/20 border border-rose-900/50 rounded-lg space-y-1 font-mono text-xs">
                <span className="text-rose-300 font-bold block text-[10px] uppercase">
                  Diagnostic Message / Investigation Detail
                </span>
                <p className="text-rose-200/90 leading-relaxed font-sans">{tech.message}</p>
              </div>
            )}

            {/* Replica Availability if Deployment / StatefulSet */}
            {typeof tech.availableReplicas === 'number' && (
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/70 font-mono text-xs flex items-center justify-between">
                <span className="text-zinc-400">Replica Availability:</span>
                <span className="text-rose-400 font-bold">
                  {tech.availableReplicas} / {tech.desiredReplicas ?? 1} available replicas
                </span>
              </div>
            )}
          </div>

          {/* Section 4: Container Statuses Table */}
          {tech.containers && tech.containers.length > 0 && (
            <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                <Activity className="w-4 h-4 text-sky-400" />
                4. Container Diagnostics & Runtime States ({tech.containers.length})
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Container</th>
                      <th className="px-3 py-2">Image</th>
                      <th className="px-3 py-2">Ready</th>
                      <th className="px-3 py-2">State / Reason</th>
                      <th className="px-3 py-2">Restarts</th>
                      <th className="px-3 py-2">Exit Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {tech.containers.map((c, idx) => (
                      <tr key={idx} className="hover:bg-zinc-950/40">
                        <td className="px-3 py-2.5 font-bold text-zinc-200">{c.name}</td>
                        <td className="px-3 py-2.5 text-zinc-400 max-w-[180px] truncate" title={c.image}>
                          {c.image}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              c.ready ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                            }`}
                          >
                            {c.ready ? 'READY' : 'NOT READY'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-200">
                          {c.waitingReason || c.terminationReason || c.state}
                          {c.waitingMessage && (
                            <div className="text-[10px] text-rose-400 max-w-[200px] truncate" title={c.waitingMessage}>
                              {c.waitingMessage}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-300">{c.restartCount ?? 0}</td>
                        <td className="px-3 py-2.5 text-zinc-300">{c.exitCode !== undefined ? c.exitCode : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 5: Kubernetes Resource Conditions */}
          {tech.conditions && tech.conditions.length > 0 && (
            <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                <Shield className="w-4 h-4 text-emerald-400" />
                5. Kubernetes Resource Conditions ({tech.conditions.length})
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Condition Type</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Reason / Message</th>
                      <th className="px-3 py-2">Last Transition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {tech.conditions.map((cond, idx) => (
                      <tr key={idx} className="hover:bg-zinc-950/40">
                        <td className="px-3 py-2 font-bold text-zinc-200">{cond.type}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              cond.status === 'True'
                                ? 'bg-emerald-950 text-emerald-300'
                                : cond.status === 'False'
                                ? 'bg-rose-950 text-rose-300'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {cond.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-300 text-xs">
                          {cond.reason && <span className="font-semibold text-zinc-200 mr-1">{cond.reason}:</span>}
                          <span>{cond.message || 'No additional message.'}</span>
                        </td>
                        <td className="px-3 py-2 text-zinc-400 text-[11px]">
                          {cond.lastTransitionTime ? cond.lastTransitionTime.slice(0, 19).replace('T', ' ') : 'Not available'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 6: Observed Kubernetes Events */}
          {tech.events && tech.events.length > 0 && (
            <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                6. Observed Kubernetes Events Log ({tech.events.length})
              </h3>

              <div className="space-y-2">
                {tech.events.slice(-6).map((evt, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-zinc-950 border border-zinc-800/70 rounded-lg font-mono text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            evt.type === 'Warning' ? 'bg-rose-950 text-rose-300' : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {evt.type || 'Normal'}
                        </span>
                        <span className="font-bold text-zinc-200">{evt.reason}</span>
                        <span className="text-zinc-500 text-[11px]">(Count: {evt.count || 1})</span>
                      </div>
                      <span className="text-zinc-500 text-[11px]">
                        {evt.timestamp ? formatTimeAgo(evt.timestamp) : 'Recent'}
                      </span>
                    </div>
                    <p className="text-zinc-300 font-sans text-xs leading-relaxed">{evt.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (4 cols): Assignee, Chronological Timeline & Investigation Notes */}
        <div className="lg:col-span-4 space-y-6">
          {/* Assigned Engineer Card */}
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-3 font-mono text-xs shadow-xs">
            <span className="text-zinc-400 font-bold block uppercase text-[10px] tracking-wider">
              Assigned Engineer
            </span>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-zinc-200 font-semibold">{incident.assignee?.name || 'Unassigned'}</div>
                  <div className="text-[11px] text-zinc-500">{incident.assignee?.email || 'No owner assigned'}</div>
                </div>
              </div>

              {canEditIncidents && (
                <select
                  value={incident.assignee?.userId || ''}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 text-xs font-semibold cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Chronological Incident Lifecycle Audit Trail */}
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Activity className="w-4 h-4 text-emerald-400" />
              Incident Audit Timeline ({timeline.length})
            </h3>

            <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
              {timeline.map((evt) => {
                let dotColor = 'bg-zinc-600 border-zinc-900';
                if (evt.type === 'DETECTION') dotColor = 'bg-rose-500 border-zinc-900';
                else if (evt.type === 'RECOVERY') dotColor = 'bg-emerald-500 border-zinc-900';
                else if (evt.type === 'OCCURRENCE') dotColor = 'bg-amber-500 border-zinc-900';
                else if (evt.type === 'STATE_CHANGE') dotColor = 'bg-sky-500 border-zinc-900';
                else if (evt.type === 'NOTE_ADDED') dotColor = 'bg-purple-500 border-zinc-900';

                return (
                  <div key={evt.id} className="relative font-mono text-xs">
                    <span
                      className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border-2 ${dotColor}`}
                    />
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="font-bold text-zinc-300">{evt.type}</span>
                      <span>{formatTimeAgo(evt.timestamp)}</span>
                    </div>
                    <div className="text-zinc-200 text-xs mt-1 leading-snug font-sans">{evt.description}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">by {evt.actor.name}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Investigation Notes Section */}
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/80 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              Investigation Notes ({notes.length})
            </h3>

            {notes.length === 0 ? (
              <div className="p-5 text-center text-xs font-mono text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                No investigation notes added yet. Record root cause findings or mitigation attempts below.
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="p-3.5 bg-zinc-950 border border-zinc-800/80 rounded-lg space-y-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span className="font-semibold text-zinc-200">{note.authorName}</span>
                      <span className="text-zinc-500">{formatTimeAgo(note.createdAt)}</span>
                    </div>
                    <p className="text-zinc-300 font-sans text-xs leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Note Authoring Form */}
            {canEditIncidents && (
              <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-zinc-800/60">
                <label className="block text-xs font-mono text-zinc-400">Add Investigation Finding:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record diagnostic observations, pod logs, remediation attempts..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 text-xs font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    disabled={isSubmittingNote || !newNoteContent.trim()}
                    icon={<Send className="w-3.5 h-3.5" />}
                  >
                    Add Note
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
