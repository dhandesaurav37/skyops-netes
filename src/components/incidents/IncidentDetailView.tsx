import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  MessageSquare,
  RefreshCw,
  Send,
  Server,
  Shield,
  Tag,
  Trash2,
  User,
  UserCheck
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Incident,
  IncidentNote,
  IncidentSeverity,
  IncidentStatus,
  TimelineEvent
} from '../../types/index';
import { SeverityBadge, StatusBadge } from '../common/Badges';
import { Button, CodeBlock, CopyButton, EmptyState, LoadingState } from '../common/UI';

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
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchIncidentData = async () => {
    try {
      setLoading(true);
      const data = await api.getIncident(incidentId);
      setIncident(data.incident);
      setTimeline(data.timeline);
      setNotes(data.notes);
    } catch (err) {
      console.error('Failed to fetch incident details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidentData();
  }, [incidentId]);

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
      // Refresh timeline
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

      // Refresh timeline to reflect note addition
      const updatedData = await api.getIncident(incident.id);
      setTimeline(updatedData.timeline);
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
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
          description="The requested incident could not be found."
          action={{ label: 'Return to Incidents', onClick: onBack }}
        />
      </div>
    );
  }

  const tech = incident.technicalDetails || {};

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Bar with Back Action & Status Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold font-mono text-sky-400">{incident.id}</span>
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
            </div>
            <h1 className="text-base font-semibold text-zinc-100 mt-1">{incident.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchIncidentData}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>

          {/* Status Quick Selector */}
          {canEditIncidents && (
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-zinc-500">Status:</span>
              <select
                value={incident.status}
                disabled={statusUpdateLoading}
                onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
                className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-sky-500 font-semibold"
              >
                <option value="OPEN">OPEN</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
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

      {/* Target Resource & Fingerprint Metadata Strip */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Cluster</span>
          <span
            onClick={() => onSelectCluster && onSelectCluster(incident.clusterId)}
            className="text-sky-400 font-semibold truncate block mt-0.5 hover:underline cursor-pointer"
          >
            {incident.clusterName}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Namespace</span>
          <span className="text-zinc-200 font-semibold truncate block mt-0.5">{incident.namespace}</span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Resource Target</span>
          <span className="text-zinc-200 font-semibold truncate block mt-0.5">
            {incident.resourceKind}/{incident.resourceName}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Occurrences</span>
          <span className="text-zinc-200 font-bold block mt-0.5">
            <span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">{incident.occurrenceCount}x</span>
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">First Seen</span>
          <span className="text-zinc-300 block mt-0.5">{formatTimeAgo(incident.firstSeenAt)}</span>
        </div>

        <div>
          <span className="text-zinc-500 block uppercase text-[10px]">Last Pulse</span>
          <span className="text-zinc-300 block mt-0.5">{formatTimeAgo(incident.lastSeenAt)}</span>
        </div>
      </div>

      {/* Main Two-Column Investigation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Technical Diagnostics & State Inspector */}
        <div className="lg:col-span-7 space-y-6">
          {/* Technical Diagnostics Box */}
          <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Layers className="w-4 h-4 text-sky-400" />
              Technical Diagnostics & Observation Evidence
            </h3>

            {/* Diagnostic Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              {tech.containerName && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/60">
                  <span className="text-zinc-500 text-[10px] block uppercase">Container Name</span>
                  <span className="text-zinc-200 font-semibold">{tech.containerName}</span>
                </div>
              )}

              {tech.image && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/60">
                  <span className="text-zinc-500 text-[10px] block uppercase">Container Image</span>
                  <span className="text-zinc-200 truncate block">{tech.image}</span>
                </div>
              )}

              {typeof tech.restartCount === 'number' && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/60">
                  <span className="text-zinc-500 text-[10px] block uppercase">Container Restart Count</span>
                  <span className="text-rose-400 font-bold">{tech.restartCount} restarts</span>
                </div>
              )}

              {typeof tech.exitCode === 'number' && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/60">
                  <span className="text-zinc-500 text-[10px] block uppercase">Termination Exit Code</span>
                  <span className="text-rose-400 font-bold">{tech.exitCode}</span>
                </div>
              )}

              {tech.nodeName && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/60">
                  <span className="text-zinc-500 text-[10px] block uppercase">Observed Node</span>
                  <span className="text-zinc-200">{tech.nodeName}</span>
                </div>
              )}

              {typeof tech.availableReplicas === 'number' && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/60">
                  <span className="text-zinc-500 text-[10px] block uppercase">Replica Availability</span>
                  <span className="text-rose-400 font-bold">
                    {tech.availableReplicas} / {tech.desiredReplicas} replicas available
                  </span>
                </div>
              )}
            </div>

            {/* Diagnostic Reason / Message Box */}
            {tech.message && (
              <div className="p-3.5 bg-rose-950/20 border border-rose-900/50 rounded-lg space-y-1 font-mono text-xs">
                <span className="text-rose-300 font-semibold block text-[11px] uppercase">
                  Diagnostic Message: {tech.reason || incident.incidentType}
                </span>
                <p className="text-rose-200/90 leading-relaxed">{tech.message}</p>
              </div>
            )}

            {/* Containers List */}
            {tech.containers && tech.containers.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-zinc-400 text-xs font-mono font-medium block">Container Statuses:</span>
                <div className="space-y-2">
                  {tech.containers.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-lg font-mono text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-200">{c.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            c.ready ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300 font-bold'
                          }`}
                        >
                          {c.ready ? 'READY' : 'NOT READY'}
                        </span>
                      </div>
                      <div className="text-zinc-400 text-[11px] truncate">Image: {c.image}</div>
                      {c.waitingReason && (
                        <div className="text-rose-400 text-[11px]">
                          State: Waiting ({c.waitingReason}) • Restarts: {c.restartCount}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fingerprint Info */}
            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <span>Deterministic Fingerprint:</span>
              <span className="text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                {incident.fingerprint.slice(0, 16)}...
              </span>
            </div>
          </div>

          {/* Investigation Notes Section */}
          <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <MessageSquare className="w-4 h-4 text-sky-400" />
              Investigation Notes & Findings ({notes.length})
            </h3>

            {/* Notes List */}
            {notes.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                No investigation notes added yet. Record root cause findings or mitigation steps below.
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="p-3.5 bg-zinc-950 border border-zinc-800/80 rounded-lg space-y-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span className="font-semibold text-zinc-200">{note.authorName}</span>
                      <span className="text-zinc-500">{formatTimestamp(note.createdAt)}</span>
                    </div>
                    <p className="text-zinc-300 font-sans text-xs leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Note Authoring Form */}
            {canEditIncidents && (
              <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-zinc-800/60">
                <label className="block text-xs font-mono text-zinc-400">Add Investigation Note:</label>
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

        {/* Right Column: Interactive Chronological Audit Timeline */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <h3 className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Activity className="w-4 h-4 text-emerald-400" />
              Incident Lifecycle Timeline
            </h3>

            {/* Timeline Stream */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
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
                      <span className="font-semibold text-zinc-300">{evt.type}</span>
                      <span>{formatTimestamp(evt.timestamp)}</span>
                    </div>
                    <div className="text-zinc-200 text-xs mt-1 leading-snug">{evt.description}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">by {evt.actor.name}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Assignee Card */}
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-2 font-mono text-xs">
            <span className="text-zinc-400 font-semibold block uppercase text-[10px]">Assigned Engineer</span>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-zinc-400" />
                <span className="text-zinc-200">{incident.assignee?.name || 'Unassigned'}</span>
              </div>

              {canEditIncidents && (
                <select
                  value={incident.assignee?.userId || ''}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500"
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
        </div>
      </div>
    </div>
  );
};
