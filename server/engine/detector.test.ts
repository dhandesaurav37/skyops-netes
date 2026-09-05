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
  assert.equal(result?.technicalDetails.rootCauseCategory, 'IMAGE_PULL'); assert.equal(result?.technicalDetails.rootCause, 'The configured container image/tag could not be found in the container registry.'); assert.equal(result?.technicalDetails.confidence, 'HIGH');
});

test('classifies registry authentication image failures separately', () => {
  const result = IncidentDetector.evaluateResource(pod({ status: 'ImagePullBackOff', containers: [{ name: 'app', image: 'private/app:v1', restartCount: 0, ready: false, state: 'waiting', waitingReason: 'ImagePullBackOff', waitingMessage: 'pull access denied: authentication required (401 Unauthorized)' }] }));
  assert.equal(result?.technicalDetails.rootCauseCategory, 'REGISTRY_AUTH');
  assert.equal(result?.technicalDetails.rootCause, 'Container registry authentication failure.');
});

for (const reason of ['ErrImagePull', 'InvalidImageName'] as const) test(`detects ${reason}`, () => {
  const result = IncidentDetector.evaluateResource(pod({ status: reason, containers: [{ name: 'app', image: 'bad', restartCount: 0, ready: false, state: 'waiting', waitingReason: reason, waitingMessage: 'bad image' }] }));
  assert.equal(result?.incidentType, 'ImagePullBackOff');
  assert.equal(result?.technicalDetails.reason, reason);
});

test('detects crash loop and OOMKilled', () => {
  const crash = IncidentDetector.evaluateResource(pod({ status: 'CrashLoopBackOff', containers: [{ name: 'app', image: 'x', restartCount: 8, ready: false, state: 'waiting', waitingReason: 'CrashLoopBackOff', exitCode: 2, lastTerminationReason: 'Error' }] }));
  assert.equal(crash?.incidentType, 'CrashLoopBackOff'); assert.equal(crash?.technicalDetails.rootCauseCategory, 'CRASH'); assert.equal(crash?.technicalDetails.exitCode, 2);
  assert.equal(IncidentDetector.evaluateResource(pod({ containers: [{ name: 'app', image: 'x', restartCount: 1, ready: false, state: 'terminated', terminationReason: 'OOMKilled', exitCode: 137 }] }))?.incidentType, 'OOMKilled');
});

test('does not infer a crash loop from a generic BackOff event', () => {
  const result = IncidentDetector.evaluateResource(pod({ status: 'Pending', health: 'WARNING', conditions: [{ type: 'Ready', status: 'False' }], containers: [{ name: 'app', image: 'x', restartCount: 0, ready: false, state: 'waiting' }], events: [{ id: 'backoff', timestamp: now, type: 'Warning', reason: 'BackOff', objectKind: 'Pod', objectName: 'workload', namespace: 'default', message: 'Back-off pulling image x' }] }));
  assert.equal(result, null);
});

test('classifies PVC StorageClass and first-consumer states without conflating them', () => {
  const missing = IncidentDetector.evaluateResource({ ...pod(), kind: 'PersistentVolumeClaim', name: 'data', status: 'Pending', containers: [], events: [{ id: 'missing', timestamp: now, type: 'Warning', reason: 'ProvisioningFailed', objectKind: 'PersistentVolumeClaim', objectName: 'data', namespace: 'default', message: 'storageclass.storage.k8s.io "fast" not found' }] });
  const waiting = IncidentDetector.evaluateResource({ ...pod(), kind: 'PersistentVolumeClaim', name: 'data-waiting', status: 'Pending', containers: [], events: [{ id: 'wait', timestamp: now, type: 'Normal', reason: 'WaitForFirstConsumer', objectKind: 'PersistentVolumeClaim', objectName: 'data-waiting', namespace: 'default', message: 'waiting for first consumer to be created before binding' }] });
  assert.equal(missing?.technicalDetails.rootCauseCategory, 'STORAGE_CLASS');
  assert.equal(waiting?.technicalDetails.rootCauseCategory, 'WAITING_FOR_CONSUMER');
});

test('classifies Pending pods using scheduling evidence', () => {
  const result = IncidentDetector.evaluateResource(pod({ status: 'Pending', health: 'WARNING', conditions: [{ type: 'PodScheduled', status: 'False' }], containers: [], events: [{ id: 'scheduled', timestamp: now, type: 'Warning', reason: 'FailedScheduling', objectKind: 'Pod', objectName: 'workload', namespace: 'default', message: '0/3 nodes are available: 3 Insufficient cpu.' }] }));
  assert.equal(result?.incidentType, 'PodSchedulingFailed'); assert.equal(result?.technicalDetails.rootCauseCategory, 'SCHEDULING');
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
  const down: KubernetesResource = { ...pod(), kind: 'Deployment', name: 'payment-service', status: '0/1 Ready', specSummary: { replicas: 1 }, statusSummary: { readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0 }, conditions: [{ type: 'Available', status: 'False' }], containers: [] };
  const healthy = { ...down, status: '1/1 Ready', statusSummary: { readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1 }, conditions: [{ type: 'Available', status: 'True' }] };
  assert.equal(IncidentDetector.evaluateResource(down)?.incidentType, 'DeploymentDegraded');
  assert.equal(IncidentDetector.evaluateResource(healthy), null); assert.equal(IncidentDetector.evaluateRecovery(healthy, 'DeploymentDegraded').recovered, true);
});

test('exempts SkyOps agent infrastructure from generating false-positive incidents during launch', () => {
  const agentDeployment: KubernetesResource = {
    ...pod(),
    kind: 'Deployment',
    namespace: 'skyops-system',
    name: 'skyops-agent',
    status: '0/1 Ready',
    specSummary: { replicas: 1 },
    statusSummary: { readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0 },
    conditions: [{ type: 'Available', status: 'False' }],
    containers: []
  };
  assert.equal(IncidentDetector.isAgentInfrastructure(agentDeployment), true);
  assert.equal(IncidentDetector.evaluateResource(agentDeployment), null);
});

test('understands healthy in-flight deployment rollout vs deadline failure', () => {
  // 1. Newly created deployment actively progressing within startup grace window
  const inFlightRollout: KubernetesResource = {
    ...pod(),
    kind: 'Deployment',
    name: 'web-service',
    createdAt: Date.now() - 30000, // 30 seconds ago
    status: '0/3 Ready',
    specSummary: { replicas: 3 },
    statusSummary: { readyReplicas: 0, availableReplicas: 0, updatedReplicas: 3 },
    conditions: [
      { type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable' },
      { type: 'Progressing', status: 'True', reason: 'ReplicaSetUpdated', message: 'ReplicaSet is progressing' }
    ],
    containers: []
  };
  assert.equal(IncidentDetector.evaluateResource(inFlightRollout), null);

  // 2. Deployment that failed progress deadline (spec.progressDeadlineSeconds exceeded)
  const failedRollout: KubernetesResource = {
    ...inFlightRollout,
    conditions: [
      { type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable' },
      { type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'Progress deadline exceeded' }
    ]
  };
  const result = IncidentDetector.evaluateResource(failedRollout);
  assert.equal(result?.incidentType, 'DeploymentDegraded');
  assert.equal(result?.severity, 'CRITICAL');
});

test('detects node pressure, PVC pending, and service without endpoints', () => {
  assert.equal(IncidentDetector.evaluateResource({ ...pod(), kind: 'Node', namespace: '', name: 'node-a', conditions: [{ type: 'MemoryPressure', status: 'True' }], containers: [] })?.incidentType, 'NodeMemoryPressure');
  assert.equal(IncidentDetector.evaluateResource({ ...pod(), kind: 'PersistentVolumeClaim', name: 'data', status: 'Pending', containers: [] })?.incidentType, 'PVCPending');
  assert.equal(IncidentDetector.evaluateResource({ ...pod(), kind: 'Service', name: 'api', specSummary: { selector: { app: 'api' } }, statusSummary: { readyEndpoints: 0 }, containers: [] })?.incidentType, 'ServiceSelectorMismatch');
});
