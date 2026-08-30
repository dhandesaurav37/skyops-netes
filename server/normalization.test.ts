import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeResource, resourceIdentity } from './normalization';

test('normalizes a ready Running pod as healthy without optional diagnostics', () => {
  const pod = normalizeResource({ kind: 'Pod', metadata: { name: 'coredns', namespace: 'kube-system' }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }], containerStatuses: [{ name: 'coredns', ready: true, state: { running: {} } }] } }, 'cluster-a');
  assert.equal(pod?.status, 'Running'); assert.equal(pod?.health, 'HEALTHY'); assert.equal(pod?.clusterId, 'cluster-a');
});
test('normalizes image pull failure and keeps cluster-scoped identity distinct', () => {
  const pod = normalizeResource({ kind: 'Pod', metadata: { name: 'bad', namespace: 'default' }, status: { phase: 'Pending', containerStatuses: [{ name: 'bad', state: { waiting: { reason: 'ImagePullBackOff' } } }] } }, 'cluster-a');
  assert.equal(pod?.status, 'ImagePullBackOff'); assert.equal(pod?.health, 'CRITICAL');
  assert.notEqual(resourceIdentity('cluster-a', 'Pod', 'default', 'bad'), resourceIdentity('cluster-b', 'Pod', 'default', 'bad'));
});
