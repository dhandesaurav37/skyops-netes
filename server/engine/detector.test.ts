import assert from 'node:assert/strict';
import test from 'node:test';
import { IncidentDetector } from './detector';
import { KubernetesResource } from '../../src/types/index';

const now = Date.now();
function pod(overrides: Partial<KubernetesResource> = {}): KubernetesResource {
  return { id: 'pod-uid', uid: 'pod-uid', clusterId: 'c1', kind: 'Pod', namespace: 'default', name: 'workload', status: 'Running', health: 'HEALTHY', createdAt: now - 600000, updatedAt: now, specSummary: { nodeName: 'node-a' }, statusSummary: { phase: 'Running' }, conditions: [{ type: 'Ready', status: 'True' }], containers: [{ name: 'app', image: 'example/app:v1', restartCount: 0, ready: true, state: 'running' }], events: [], ...overrides };
}

test('investigates image pull errors from current container state', () => {
  const result = IncidentDetector.evaluateResource(pod({ status: 'ImagePullBackOff', health: 'CRITICAL', conditions: [{ type: 'Ready', status: 'False' }], containers: [{ name: 'app', image: 'nginx:no-such-tag', restartCount: 0, ready: false, state: 'waiting', waitingReason: 'ImagePullBackOff', waitingMessage: 'failed to resolve image: not found' }] }));
  assert.equal(result?.incidentType, 'ImagePullBackOff'); assert.equal(result?.severity, 'HIGH');
  assert.equal(result?.technicalDetails.rootCause, 'Container image cannot be resolved or pulled by the runtime.'); assert.equal(result?.technicalDetails.confidence, 'HIGH');
});

for (const reason of ['ErrImagePull', 'InvalidImageName'] as const) test(`detects ${reason}`, () => {
  const result = IncidentDetector.evaluateResource(pod({ status: reason, containers: [{ name: 'app', image: 'bad', restartCount: 0, ready: false, state: 'waiting', waitingReason: reason, waitingMessage: 'bad image' }] }));
  assert.equal(result?.incidentType, 'ImagePullBackOff');
  assert.equal(result?.technicalDetails.reason, reason);
});

test('detects crash loop and OOMKilled', () => {
  assert.equal(IncidentDetector.evaluateResource(pod({ status: 'CrashLoopBackOff', containers: [{ name: 'app', image: 'x', restartCount: 8, ready: false, state: 'waiting', waitingReason: 'CrashLoopBackOff' }] }))?.incidentType, 'CrashLoopBackOff');
  assert.equal(IncidentDetector.evaluateResource(pod({ containers: [{ name: 'app', image: 'x', restartCount: 1, ready: false, state: 'terminated', terminationReason: 'OOMKilled', exitCode: 137 }] }))?.incidentType, 'OOMKilled');
});

test('does not turn Pending without evidence into an incident', () => {
  assert.equal(IncidentDetector.evaluateResource(pod({ status: 'Pending', health: 'WARNING', conditions: [{ type: 'PodScheduled', status: 'False' }], containers: [] })), null);
});

test('does not create stale readiness incident from historical event', () => {
  const result = IncidentDetector.evaluateResource(pod({ events: [{ id: 'old', timestamp: now - 3600000, type: 'Warning', reason: 'Unhealthy', objectKind: 'Pod', objectName: 'workload', namespace: 'default', message: 'Readiness probe failed' }] }));
  assert.equal(result, null);
});

test('detects current readiness failure and resolves after readiness returns', () => {
  const failing = pod({ health: 'WARNING', conditions: [{ type: 'Ready', status: 'False' }], containers: [{ name: 'app', image: 'x', restartCount: 0, ready: false, state: 'running' }], events: [{ id: 'recent', timestamp: now, type: 'Warning', reason: 'Unhealthy', objectKind: 'Pod', objectName: 'workload', namespace: 'default', message: 'Readiness probe failed' }] });
  assert.equal(IncidentDetector.evaluateResource(failing)?.incidentType, 'ReadinessProbeFailed');
  assert.equal(IncidentDetector.evaluateRecovery(pod(), 'ReadinessProbeFailed').recovered, true);
});

test('detects and recovers deployment availability deterministically', () => {
  const down: KubernetesResource = { ...pod(), kind: 'Deployment', name: 'skyops-agent', status: '0/1 Ready', specSummary: { replicas: 1 }, statusSummary: { readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0 }, conditions: [{ type: 'Available', status: 'False' }], containers: [] };
  const healthy = { ...down, status: '1/1 Ready', statusSummary: { readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1 }, conditions: [{ type: 'Available', status: 'True' }] };
  assert.equal(IncidentDetector.evaluateResource(down)?.incidentType, 'DeploymentDegraded');
  assert.equal(IncidentDetector.evaluateResource(healthy), null); assert.equal(IncidentDetector.evaluateRecovery(healthy, 'DeploymentDegraded').recovered, true);
});

test('detects node pressure, PVC pending, and service without endpoints', () => {
  assert.equal(IncidentDetector.evaluateResource({ ...pod(), kind: 'Node', namespace: '', name: 'node-a', conditions: [{ type: 'MemoryPressure', status: 'True' }], containers: [] })?.incidentType, 'NodeMemoryPressure');
  assert.equal(IncidentDetector.evaluateResource({ ...pod(), kind: 'PersistentVolumeClaim', name: 'data', status: 'Pending', containers: [] })?.incidentType, 'PVCPending');
  assert.equal(IncidentDetector.evaluateResource({ ...pod(), kind: 'Service', name: 'api', specSummary: { selector: { app: 'api' } }, statusSummary: { readyEndpoints: 0 }, containers: [] })?.incidentType, 'ServiceSelectorMismatch');
});
