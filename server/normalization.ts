import { KubernetesResource } from '../src/types/index';

type RawRecord = Record<string, unknown>;
const POD_WAITING_FAILURES = new Set([
  'ErrImagePull', 'ImagePullBackOff', 'InvalidImageName', 'CreateContainerConfigError', 'CreateContainerError', 'CrashLoopBackOff'
]);

const object = (value: unknown): RawRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RawRecord : {};
const string = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function resourceIdentity(clusterId: string, kind: string, namespace: string, name: string): string {
  return [clusterId, kind.toLowerCase(), namespace.toLowerCase(), name.toLowerCase()].join('/');
}

/** Converts a Kubernetes API object or agent observation into the sole UI/detector resource model. */
export function normalizeResource(value: unknown, authenticatedClusterId: string, now = Date.now()): KubernetesResource | null {
  const raw = object(value);
  const metadata = object(raw.metadata);
  const kind = string(raw.kind).trim();
  const name = string(metadata.name, string(raw.name)).trim();
  if (!kind || !name) return null;
  const namespace = string(metadata.namespace, string(raw.namespace)).trim();
  const spec = object(raw.specSummary); const statusSummary = object(raw.statusSummary);
  const rawSpec = Object.keys(spec).length ? spec : object(raw.spec);
  const rawStatus = Object.keys(statusSummary).length ? statusSummary : object(raw.status);
  const conditions = list(raw.conditions ?? rawStatus.conditions).map(value => {
    const c = object(value); return { type: string(c.type), status: string(c.status), reason: string(c.reason) || undefined, message: string(c.message) || undefined, lastTransitionTime: string(c.lastTransitionTime) || undefined };
  }).filter(c => c.type);
  const rawContainers = list(raw.containers).length ? list(raw.containers) : [...list(rawStatus.initContainerStatuses), ...list(rawStatus.containerStatuses)];
  const containers = rawContainers.map(value => {
    const c = object(value); const state = object(c.state); const waiting = object(state.waiting); const terminated = object(state.terminated);
    const explicitState = string(c.state);
    const stateName = explicitState || (Object.keys(waiting).length ? 'waiting' : Object.keys(terminated).length ? 'terminated' : 'running');
    return { name: string(c.name, 'container'), image: string(c.image), restartCount: number(c.restartCount), ready: c.ready === true, state: stateName, waitingReason: string(c.waitingReason, string(waiting.reason)) || undefined, waitingMessage: string(c.waitingMessage, string(waiting.message)) || undefined, terminationReason: string(c.terminationReason, string(terminated.reason)) || undefined, exitCode: typeof c.exitCode === 'number' ? c.exitCode : typeof terminated.exitCode === 'number' ? terminated.exitCode : undefined };
  });
  let status = string(raw.status, string(rawStatus.phase, 'Unknown'));
  let health: KubernetesResource['health'] = raw.health === 'HEALTHY' || raw.health === 'WARNING' || raw.health === 'CRITICAL' ? raw.health : 'HEALTHY';
  if (kind === 'Pod') {
    const failed = containers.find(c => c.waitingReason && POD_WAITING_FAILURES.has(c.waitingReason));
    const terminated = containers.find(c => c.terminationReason && c.terminationReason !== 'Completed');
    const ready = conditions.find(c => c.type === 'Ready')?.status === 'True';
    // Kubernetes phase remains authoritative unless a concrete container failure explains it.
    status = failed?.waitingReason || terminated?.terminationReason || string(rawStatus.phase, status || 'Unknown');
    health = failed || terminated || status === 'Failed' ? 'CRITICAL' : status === 'Running' && (ready || containers.every(c => c.ready || c.state === 'running')) ? 'HEALTHY' : status === 'Pending' || status === 'Unknown' ? 'WARNING' : 'HEALTHY';
  } else if (kind === 'Node') {
    const ready = conditions.find(c => c.type === 'Ready')?.status === 'True'; status = ready ? 'Ready' : 'NotReady'; health = ready ? 'HEALTHY' : 'CRITICAL';
  } else if (kind === 'PersistentVolumeClaim') { status = string(rawStatus.phase, status); health = status === 'Bound' ? 'HEALTHY' : status === 'Lost' ? 'CRITICAL' : 'WARNING'; }
  const created = Date.parse(string(metadata.creationTimestamp));
  return { id: string(metadata.uid) || resourceIdentity(authenticatedClusterId, kind, namespace, name), clusterId: authenticatedClusterId, kind, namespace, name, status: status || 'Unknown', health, createdAt: Number.isNaN(created) ? number(raw.createdAt, now) : created, updatedAt: now, specSummary: rawSpec, statusSummary: rawStatus, conditions, containers, events: list(raw.events).map(event => object(event) as never) };
}

export function normalizeTelemetry(payload: unknown, clusterId: string): KubernetesResource[] | null {
  const body = object(payload);
  const rawList = object(body.rawK8sList);
  const candidates: unknown[] | null = Array.isArray(body.resources) ? body.resources : Array.isArray(body.items) ? body.items.map(item => object(item).payload) : Array.isArray(rawList.items) ? rawList.items : null;
  if (candidates === null) return null;
  const deduped = new Map<string, KubernetesResource>();
  for (const candidate of candidates) { const resource = normalizeResource(candidate, clusterId); if (resource) deduped.set(resourceIdentity(clusterId, resource.kind, resource.namespace, resource.name), resource); }
  return [...deduped.values()];
}
