import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Edit2,
  ExternalLink,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  XCircle
} from 'lucide-react';
import React, { useState } from 'react';
import { api } from '../../api/client';
import { AIEvidenceCategory, AIRiskLevel, SkyOpsAIAnalysis, StructuredRemediation } from '../../types/index';
import { Button } from '../common/UI';

interface SkyOpsAIAnalysisCardProps {
  incidentId: string;
  initialAnalysis?: SkyOpsAIAnalysis | null;
  initialRemediation?: StructuredRemediation | null;
  canEdit?: boolean;
  onRemediationApplied?: () => void;
}

export const SkyOpsAIAnalysisCard: React.FC<SkyOpsAIAnalysisCardProps> = ({
  incidentId,
  initialAnalysis,
  initialRemediation,
  canEdit = true,
  onRemediationApplied
}) => {
  const [analysis, setAnalysis] = useState<SkyOpsAIAnalysis | null>(initialAnalysis || null);
  const [remediation, setRemediation] = useState<StructuredRemediation | null>(
    initialRemediation || initialAnalysis?.structuredRemediation || null
  );
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customImage, setCustomImage] = useState('');
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-fetch if not provided initially
  React.useEffect(() => {
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
      if (initialAnalysis.status === 'SUCCESS' && initialAnalysis.structuredRemediation) {
        setRemediation(initialAnalysis.structuredRemediation);
        setCustomImage(initialAnalysis.structuredRemediation.parameters?.proposedImage || '');
      } else {
        setRemediation(null);
        setCustomImage('');
      }
    } else {
      fetchAnalysis(false);
    }
  }, [incidentId, initialAnalysis]);

  React.useEffect(() => {
    if (initialRemediation && analysis?.status === 'SUCCESS' && initialRemediation.parameters?.proposedImage) {
      setRemediation(initialRemediation);
      setCustomImage(initialRemediation.parameters.proposedImage);
    } else if (!initialRemediation || analysis?.status !== 'SUCCESS') {
      setRemediation(null);
      setCustomImage('');
    }
  }, [initialRemediation, analysis?.status]);

  const fetchAnalysis = async (force = false) => {
    try {
      setLoading(true);
      setError(null);
      setActionMessage(null);
      const res = await api.triggerIncidentAIAnalysis(incidentId, force);
      setAnalysis(res.analysis);
      if (res.analysis.status === 'SUCCESS' && (res.remediation || res.analysis.structuredRemediation)) {
        const rem = res.remediation || res.analysis.structuredRemediation;
        setRemediation(rem || null);
        setCustomImage(rem?.parameters?.proposedImage || '');
      } else {
        setRemediation(null);
        setCustomImage('');
      }
    } catch (err: any) {
      console.error('Failed to trigger SkyOps AI analysis:', err);
      setError(err?.message || 'Failed to complete AI analysis');
      setRemediation(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRemediation = async () => {
    if (!remediation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const proposedImage = customImage.trim() || remediation.parameters.proposedImage;
      const res = await api.approveRemediation(incidentId, { proposedImage });
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: `Remediation approved. Action dispatched to SkyOps Agent on cluster "${res.remediation.clusterName || 'production'}".`
      });
      setIsEditingImage(false);
      if (onRemediationApplied) {
        onRemediationApplied();
      }
    } catch (err: any) {
      console.error('Failed to approve remediation:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to approve remediation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRemediation = async () => {
    if (!remediation) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const res = await api.rejectRemediation(incidentId, 'Declined by engineer');
      setRemediation(res.remediation);
      setActionMessage({
        type: 'success',
        text: 'Remediation proposal declined. Workload remains unchanged.'
      });
      if (onRemediationApplied) {
        onRemediationApplied();
      }
    } catch (err: any) {
      console.error('Failed to decline remediation:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to decline remediation'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyAnalysis = () => {
    if (!analysis) return;
    const text = `[SkyOps AI Incident Intelligence]
Ticket: ${analysis.incidentId}
1. Summary: ${analysis.summary}
2. Root Cause: ${analysis.rootCause}
3. Confidence: ${Math.round(analysis.confidence * 100)}% (${analysis.confidenceExplanation || 'Evidence verified'})
4. Recommended Fix: ${analysis.recommendedFix.description}
5. Change Preview: ${analysis.changePreview ? `${analysis.changePreview.resource} ${analysis.changePreview.namespace}/${analysis.changePreview.object}: ${analysis.changePreview.field} -> ${analysis.changePreview.proposedValue}` : 'N/A'}
6. Risk: ${analysis.recommendedFix.risk} (${analysis.riskExplanation || analysis.recommendedFix.reason})
7. Expected Impact: ${analysis.expectedImpact || analysis.recommendedFix.expectedImpact}
8. Rollback: ${analysis.rollback || analysis.recommendedFix.rollback}
9. Verification: ${analysis.verificationCriteria?.expectedState || 'Telemetry check'}
10. Safer Alternative: ${analysis.saferAlternative.description}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getRiskBadge = (risk: AIRiskLevel) => {
    switch (risk) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
            <ShieldAlert className="w-3 h-3" />
            CRITICAL RISK
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-orange-950/80 text-orange-300 border border-orange-800">
            <ShieldAlert className="w-3 h-3" />
            HIGH RISK
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
            <AlertTriangle className="w-3 h-3" />
            MEDIUM RISK
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            <ShieldCheck className="w-3 h-3" />
            LOW RISK
          </span>
        );
    }
  };

  const getConfidenceColor = (confidence: number) => {
    const pct = Math.round(confidence * 100);
    if (pct >= 85) return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80';
    if (pct >= 60) return 'text-amber-400 bg-amber-950/60 border-amber-800/80';
    return 'text-zinc-400 bg-zinc-900 border-zinc-700';
  };

  const getEvidenceCategoryBadge = (category?: AIEvidenceCategory) => {
    switch (category) {
      case 'OBSERVED_FACT':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            FACT
          </span>
        );
      case 'AI_INFERENCE':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-950/80 text-sky-300 border border-sky-800">
            INFERENCE
          </span>
        );
      case 'PROPOSED_CHANGE':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-800">
            PROPOSED
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-900 text-zinc-400 border border-zinc-700">
            EVIDENCE
          </span>
        );
    }
  };

  return (
    <div className="p-5 rounded-xl bg-linear-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950 border border-sky-800/50 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-100 font-mono tracking-tight flex items-center gap-1.5">
                SkyOps Incident Reasoning Engine
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-950/80 text-sky-300 border border-sky-800/70 flex items-center gap-1">
                <Cpu className="w-2.5 h-2.5" />
                10-Point Evidence Reasoning
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Authoritative Kubernetes context correlation, precise change previews, and verified closed-loop execution
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {analysis && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAnalysis}
              icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              className="text-xs"
            >
              {copied ? 'Copied' : 'Copy RCA'}
            </Button>
          )}

          {canEdit && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => fetchAnalysis(true)}
              disabled={loading || actionLoading}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
            >
              {loading ? 'Reasoning with SkyOps AI...' : 'Re-Analyze'}
            </Button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && !analysis && (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
          <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
          <div>
            <p className="text-xs font-semibold text-zinc-200">Executing SkyOps Incident Reasoning Engine...</p>
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
              Correlating Kubernetes telemetry, container states, exit codes, events, and ownership references
            </p>
          </div>
        </div>
      )}

      {/* Error / Action Feedback Banner */}
      {error && (
        <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/70 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-300">AI Analysis Notice</p>
            <p className="text-[11px] leading-relaxed text-amber-200/90">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div
          className={`p-3.5 rounded-lg border flex items-start gap-2.5 text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/70 text-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <p className="text-xs leading-relaxed">{actionMessage.text}</p>
        </div>
      )}

      {/* Analysis Content */}
      {analysis && (
        <div className="space-y-5">
          {/* Status notice if unavailable or offline */}
          {analysis.status === 'UNAVAILABLE' && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 flex items-center gap-2 text-xs text-amber-300">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {analysis.errorMessage || 'AI reasoning engine is running in offline fallback mode. Core incident monitoring continues normally.'}
              </span>
            </div>
          )}

          {/* Primary RCA Grid: 1. What Happened & 2. Root Cause */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
            {/* Left Box: Root Cause & Summary (8 cols) */}
            <div className="lg:col-span-8 p-4 bg-zinc-950/90 rounded-lg border border-zinc-800/80 space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono uppercase font-bold text-sky-400">
                    1. Observable Failure Summary
                  </span>
                </div>
                <p className="text-zinc-200 text-xs leading-relaxed font-mono bg-zinc-900/60 p-2.5 rounded border border-zinc-800/60">
                  {analysis.summary}
                </p>
              </div>

              <div className="border-t border-zinc-800/70 pt-2.5">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 block mb-1">
                  2. Proven Root Cause
                </span>
                <p className="text-sm font-semibold text-zinc-100 leading-relaxed">
                  {analysis.rootCause}
                </p>
              </div>
            </div>

            {/* Right Box: 3. Confidence & Explanation (4 cols) */}
            <div className="lg:col-span-4 p-4 bg-zinc-950/90 rounded-lg border border-zinc-800/80 flex flex-col justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-zinc-400 block mb-1.5">
                  3. Confidence & Evidence Score
                </span>
                <div className="flex items-center gap-2.5">
                  <div className={`px-3 py-1 rounded-lg border font-mono font-bold text-lg ${getConfidenceColor(analysis.confidence)}`}>
                    {Math.round(analysis.confidence * 100)}%
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-tight">
                    {analysis.confidenceExplanation ||
                      (analysis.confidence >= 0.85
                        ? 'High certainty supported by authoritative telemetry'
                        : 'Moderate certainty; inspect supplementary logs')}
                  </div>
                </div>
              </div>

              {/* Deterministic Guardrails Banner */}
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="text-[11px] font-mono">
                  <span className="text-zinc-200 font-bold block">Deterministic Safety Gate</span>
                  <span className="text-zinc-400 text-[10px]">Reasoning only • Requires human approval</span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* MANUAL INSPECTION GUIDANCE (when AI is unavailable or failed) */}
          {/* ========================================================================= */}
          {(analysis.status === 'UNAVAILABLE' || analysis.status === 'FAILED') && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/60 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold font-mono text-amber-300 uppercase tracking-wide">
                    AI Unavailable — Manual Inspection Mode
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    SkyOps AI reasoning is temporarily offline or experiencing high demand. In accordance with safety policy, no automated or executable remediation proposal has been generated.
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold block">
                  Authoritative Inspection Commands:
                </span>
                <div className="space-y-1.5 font-mono text-xs text-zinc-200">
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800/80">
                    <code>kubectl describe {analysis.affectedResources[0]?.kind.toLowerCase() || 'pod'} {analysis.affectedResources[0]?.name || ''} -n {analysis.affectedResources[0]?.namespace || 'default'}</code>
                  </div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800/80">
                    <code>kubectl logs {analysis.affectedResources[0]?.name || ''} -n {analysis.affectedResources[0]?.namespace || 'default'}</code>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. CORROBORATING EVIDENCE (Categorized) */}
          {/* ========================================================================= */}
          <div className="p-4 bg-zinc-950/90 rounded-lg border border-zinc-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                4. Corroborating Evidence & Grounding
              </span>
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Fact
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400" /> Inference
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-400" /> Proposed
                </span>
              </div>
            </div>

            {analysis.evidence && analysis.evidence.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {analysis.evidence.map((ev, idx) => (
                  <div key={idx} className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                    <div className="shrink-0 mt-0.5">{getEvidenceCategoryBadge(ev.category)}</div>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase block">
                        {ev.source}
                      </span>
                      <p className="text-zinc-200 text-xs mt-0.5 break-words">{ev.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 font-mono">No supplementary evidence items recorded.</p>
            )}
          </div>

          {/* ========================================================================= */}
          {/* 5, 6, 7, 8, 9, 10. REASONING & REMEDIATION MATRIX */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* 5. Recommended Fix & 8. Risk */}
            <div className="p-4 bg-zinc-950/90 rounded-lg border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold text-sky-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  5. Recommended Remediation
                </span>
                {getRiskBadge(analysis.recommendedFix.risk)}
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-100 leading-relaxed">
                  {analysis.recommendedFix.description}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  <strong className="text-zinc-300">Why this resolves root cause:</strong> {analysis.recommendedFix.reason}
                </p>
              </div>

              {/* 7. Expected Impact & 8. Risk Explanation */}
              <div className="pt-2 border-t border-zinc-800/70 space-y-1.5 text-[11px]">
                <div>
                  <span className="text-zinc-400 font-mono font-bold">7. Expected Impact: </span>
                  <span className="text-zinc-200">{analysis.expectedImpact || analysis.recommendedFix.expectedImpact}</span>
                </div>
                {analysis.riskExplanation && (
                  <div>
                    <span className="text-zinc-400 font-mono font-bold">8. Risk Classification: </span>
                    <span className="text-zinc-300">{analysis.riskExplanation}</span>
                  </div>
                )}
                {/* 9. Rollback */}
                <div>
                  <span className="text-zinc-400 font-mono font-bold block mb-0.5">9. Rollback Procedure: </span>
                  <span className="text-zinc-200 font-mono bg-zinc-900 px-2 py-1 rounded border border-zinc-800 block break-all">
                    {analysis.rollback || analysis.recommendedFix.rollback}
                  </span>
                </div>
              </div>
            </div>

            {/* 10. Verification Criteria & Safest Alternative */}
            <div className="p-4 bg-zinc-950/90 rounded-lg border border-zinc-800/80 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  10. Telemetry Verification Criteria
                </span>

                {analysis.verificationCriteria ? (
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 space-y-1.5 font-mono text-[11px]">
                    <div className="text-zinc-200 font-semibold">
                      Expected State: <span className="text-emerald-300">{analysis.verificationCriteria.expectedState}</span>
                    </div>
                    {analysis.verificationCriteria.conditions && analysis.verificationCriteria.conditions.length > 0 && (
                      <div className="space-y-1 text-zinc-300">
                        <span className="text-[10px] text-zinc-400 uppercase font-bold block">Conditions to Observe:</span>
                        {analysis.verificationCriteria.conditions.map((cond, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-sky-300">{cond.type}={cond.status}</span>
                            {cond.description && <span className="text-zinc-400 truncate">({cond.description})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {analysis.verificationCriteria.observationWindowSeconds && (
                      <div className="text-[10px] text-zinc-400">
                        Observation Window: {analysis.verificationCriteria.observationWindowSeconds}s
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 font-mono">Observe Kubernetes pod condition Ready=True</p>
                )}

                <div className="pt-2 border-t border-zinc-800/70">
                  <span className="text-[10px] font-mono uppercase font-bold text-purple-400 flex items-center gap-1.5 mb-1">
                    <Shield className="w-3.5 h-3.5" />
                    Safest Declarative Alternative
                  </span>
                  <p className="text-xs font-semibold text-zinc-100 leading-relaxed">
                    {analysis.saferAlternative.description}
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
                    {analysis.saferAlternative.reason}
                  </p>
                </div>
              </div>

              {/* Additional Evidence Needed (if any) */}
              {analysis.additionalEvidenceNeeded && analysis.additionalEvidenceNeeded.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/70 text-[11px]">
                  <span className="text-zinc-400 font-mono block mb-1">Missing Evidence Items:</span>
                  <ul className="list-disc list-inside text-zinc-300 space-y-0.5 text-[10px]">
                    {analysis.additionalEvidenceNeeded.map((item, idx) => (
                      <li key={idx} className="truncate">{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 6. CONTROLLED AI REMEDIATION PROPOSAL & EXACT CHANGE PREVIEW */}
          {/* ========================================================================= */}
          {remediation &&
            analysis.status === 'SUCCESS' &&
            remediation.parameters?.proposedImage &&
            remediation.parameters.proposedImage !== 'unknown' &&
            remediation.actionType !== 'MANUAL_INSPECTION' &&
            remediation.actionType !== 'UNSPECIFIED' && (
            <div className="p-4 rounded-xl bg-linear-to-b from-sky-950/40 via-zinc-900/90 to-zinc-950 border-2 border-sky-600/50 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-800/40 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-md bg-sky-500/20 text-sky-300">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold font-mono text-sky-200 uppercase tracking-wide flex items-center gap-2">
                      6. Controlled Remediation & Change Preview
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-900/80 text-sky-300 border border-sky-700">
                        {remediation.actionType}
                      </span>
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Exact strategic patch preview requiring operator approval before dispatching to the in-cluster agent
                    </p>
                  </div>
                </div>

                {/* Remediation Status Pill */}
                <div>
                  {remediation.status === 'PROPOSED' && (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1.5">
                      <Lock className="w-3 h-3" />
                      AWAITING APPROVAL
                    </span>
                  )}
                  {remediation.status === 'DISPATCHED' && (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-800 flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      DISPATCHED TO AGENT
                    </span>
                  )}
                  {remediation.status === 'EXECUTED' && (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800 flex items-center gap-1.5">
                      <Play className="w-3 h-3" />
                      PATCH APPLIED (VERIFYING)
                    </span>
                  )}
                  {remediation.status === 'VERIFYING' && (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-800 flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      OBSERVING TELEMETRY
                    </span>
                  )}
                  {remediation.status === 'VERIFIED_RESOLVED' && (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      VERIFIED RESOLVED
                    </span>
                  )}
                  {remediation.status === 'REJECTED' && (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-zinc-900 text-zinc-400 border border-zinc-700 flex items-center gap-1.5">
                      <XCircle className="w-3 h-3" />
                      DECLINED
                    </span>
                  )}
                  {remediation.status === 'FAILED' && (
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3" />
                      EXECUTION FAILED
                    </span>
                  )}
                </div>
              </div>

              {/* Exact Change Preview Box */}
              {analysis.changePreview && (
                <div className="p-3 bg-zinc-950/90 rounded-lg border border-sky-800/60 font-mono text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800 pb-1">
                    <span className="text-sky-300 font-bold">Exact Strategic Patch Target:</span>
                    <span>{analysis.changePreview.resource} in {analysis.changePreview.namespace}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">OBJECT & CONTAINER</span>
                      <span className="text-zinc-200">{analysis.changePreview.object} {analysis.changePreview.container ? `(container: ${analysis.changePreview.container})` : ''}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">FIELD PATH</span>
                      <code className="text-zinc-300">{analysis.changePreview.field}</code>
                    </div>
                  </div>
                </div>
              )}

              {/* Target Resource & Visual Diff */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-zinc-950/90 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold block mb-1">
                    Target Workload
                  </span>
                  <div className="font-mono text-zinc-200">
                    <span className="text-sky-400 font-bold">{remediation.targetResource.kind}</span>{' '}
                    <span className="text-zinc-400">{remediation.targetResource.namespace || 'default'}/</span>
                    <span className="text-zinc-100 font-semibold">{remediation.targetResource.name}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1">
                    Container: <code className="text-zinc-200 font-mono">{remediation.parameters.containerName}</code>
                  </div>
                </div>

                <div className="md:col-span-2 p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">
                      Container Image Strategic Diff
                    </span>
                    {remediation.status === 'PROPOSED' && canEdit && (
                      <button
                        type="button"
                        onClick={() => setIsEditingImage(!isEditingImage)}
                        className="text-[11px] font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        {isEditingImage ? 'Cancel custom tag' : 'Customize tag'}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs font-mono">
                    {/* Current Failing Image */}
                    <div className="p-2 rounded bg-rose-950/30 border border-rose-900/60 text-rose-300 flex-1 truncate">
                      <span className="text-[9px] uppercase tracking-wider text-rose-400 block mb-0.5">Current (Failing)</span>
                      <span className="line-through">{remediation.parameters.currentImage || 'unknown'}</span>
                    </div>

                    <ArrowRight className="w-4 h-4 text-sky-400 shrink-0 hidden sm:block" />

                    {/* Proposed Fix Image */}
                    <div className="p-2 rounded bg-emerald-950/30 border border-emerald-900/60 text-emerald-300 flex-1 truncate">
                      <span className="text-[9px] uppercase tracking-wider text-emerald-400 block mb-0.5">Proposed Target</span>
                      {!isEditingImage ? (
                        <span className="font-bold text-emerald-200">{customImage || remediation.parameters.proposedImage}</span>
                      ) : (
                        <input
                          type="text"
                          value={customImage}
                          onChange={(e) => setCustomImage(e.target.value)}
                          placeholder="e.g. registry.company.com/app:v1.2.4"
                          className="w-full bg-zinc-900 border border-emerald-600 rounded px-2 py-0.5 text-xs text-emerald-200 font-mono focus:outline-hidden"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Execution Lifecycle Progress Tracker */}
              <div className="p-3 bg-zinc-950/90 rounded-lg border border-zinc-800 space-y-2">
                <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold block">
                  Closed-Loop Remediation Pipeline
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs font-mono">
                  {/* Step 1: AI Reasoning */}
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <div>
                      <span className="font-bold block text-[10px]">1. AI Proposed</span>
                      <span className="text-zinc-400 text-[9px]">Root cause & fix preview</span>
                    </div>
                  </div>

                  {/* Step 2: Human Approval */}
                  <div
                    className={`p-2 rounded border flex items-center gap-2 ${
                      remediation.status !== 'PROPOSED' && remediation.status !== 'REJECTED'
                        ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                        : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    {remediation.approval ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    )}
                    <div>
                      <span className="font-bold block text-[10px]">2. Operator Approval</span>
                      <span className="text-zinc-400 text-[9px]">
                        {remediation.approval?.approvedBy?.name ? `By ${remediation.approval.approvedBy.name}` : 'Human gate required'}
                      </span>
                    </div>
                  </div>

                  {/* Step 3: Agent Patch Execution */}
                  <div
                    className={`p-2 rounded border flex items-center gap-2 ${
                      remediation.status === 'EXECUTED' ||
                      remediation.status === 'VERIFYING' ||
                      remediation.status === 'VERIFIED_RESOLVED'
                        ? 'bg-zinc-900 border-zinc-800 text-emerald-400'
                        : remediation.status === 'DISPATCHED'
                        ? 'bg-blue-950/40 border-blue-800 text-blue-300'
                        : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    {remediation.execution?.status === 'SUCCESS' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : remediation.status === 'DISPATCHED' ? (
                      <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-400" />
                    ) : (
                      <Terminal className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block text-[10px]">3. Agent Patch</span>
                      <span className="text-zinc-400 text-[9px]">
                        {remediation.execution?.status === 'SUCCESS' ? 'Strategic merge applied' : 'In-cluster agent'}
                      </span>
                    </div>
                  </div>

                  {/* Step 4: Closed-Loop Telemetry Verification */}
                  <div
                    className={`p-2 rounded border flex items-center gap-2 ${
                      remediation.status === 'VERIFIED_RESOLVED'
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                        : remediation.status === 'VERIFYING' || remediation.status === 'EXECUTED'
                        ? 'bg-purple-950/40 border-purple-800 text-purple-300'
                        : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    {remediation.status === 'VERIFIED_RESOLVED' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : remediation.status === 'VERIFYING' ? (
                      <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-purple-400" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold block text-[10px]">4. Telemetry Verified</span>
                      <span className="text-zinc-400 text-[9px]">
                        {remediation.status === 'VERIFIED_RESOLVED' ? 'Zero errors & Healthy' : 'Awaiting live check'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Execution Details & Verification Message */}
              {remediation.verification && (
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Authoritative Telemetry State
                    </span>
                    <span>
                      {remediation.verification.verifiedAt
                        ? `Verified ${new Date(remediation.verification.verifiedAt).toLocaleTimeString()}`
                        : `Observation cycles: ${remediation.verification.checkCount || 1}`}
                    </span>
                  </div>
                  <p className="text-zinc-200 text-xs">{remediation.verification.observedState}</p>
                  {remediation.verification.details && (
                    <p className="text-[11px] text-zinc-400">{remediation.verification.details}</p>
                  )}
                </div>
              )}

              {/* Interactive Approval Bar for SRE Engineer */}
              {remediation.status === 'PROPOSED' && canEdit && (
                <div className="p-3 rounded-lg bg-zinc-950/90 border border-sky-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-sky-400" />
                      Engineer Authorization Required
                    </span>
                    <p className="text-[11px] text-zinc-400">
                      Approving will dispatch this typed image update command to the connected SkyOps Kubernetes Agent.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRejectRemediation}
                      disabled={actionLoading}
                      icon={<X className="w-3.5 h-3.5 text-zinc-400" />}
                      className="text-xs text-zinc-300 hover:text-rose-300 hover:border-rose-800"
                    >
                      Decline
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApproveRemediation}
                      disabled={actionLoading}
                      icon={<Play className="w-3.5 h-3.5" />}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm"
                    >
                      {actionLoading ? 'Dispatching...' : 'Approve & Execute Fix'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Safety Disclaimer & Latency Metrics */}
          <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-zinc-500" />
              Kubernetes → SkyOps Agent → Evidence → AI Reasoning → Human Decision → Execution → Verification
            </span>
            <div className="flex items-center gap-3">
              {analysis.timing && (
                <span className="text-[10px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-zinc-300">
                  <span className="text-sky-400 font-bold">{analysis.timing.durations.totalMs}ms</span> (Gemini: {analysis.timing.durations.geminiCallMs}ms, Context: {analysis.timing.durations.contextConstructionMs}ms)
                </span>
              )}
              <span>
                Analyzed {new Date(analysis.analyzedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
