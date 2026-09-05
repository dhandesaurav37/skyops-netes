import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from './store';
import { KubernetesResource, StructuredRemediation } from '../src/types/index';

test('AI-Assisted Remediation Canonical Flow Suite', async (t) => {
  const store = new DataStore();
  const userId = 'user-sre-remediation';
  store.upsertUser({ id: userId, email: 'sre@remediation.test', name: 'SRE Approver' });
  const org = store.createOrganization('Remediation Org', userId);
  const { cluster } = store.createCluster(org.id, 'k8s-prod-remediation');

  await t.test('Full canonical flow: Telemetry -> Incident -> Proposal -> Approval -> Action -> Agent Result -> Fresh Telemetry -> Verification -> Resolve', () => {
    const t0 = Date.now() - 10000;

    // 1. Initial Kubernetes Telemetry shows ImagePullBackOff
    const initialPod: KubernetesResource = {
      id: `pod-${cluster.id}-nginx-test`,
      clusterId: cluster.id,
      name: 'nginx-test',
      namespace: 'default',
      kind: 'Pod',
      status: 'Waiting',
      health: 'CRITICAL',
      createdAt: t0 - 60000,
      updatedAt: t0,
      specSummary: {
        containers: [{ name: 'nginx-container', image: 'nginx:invalidtag' }]
      },
      statusSummary: {
        observedState: 'Waiting',
        containerStates: [
          {
            name: 'nginx-container',
            state: 'waiting',
            ready: false,
            image: 'nginx:invalidtag',
            waiting: { reason: 'ImagePullBackOff', message: 'Failed to pull image nginx:invalidtag' }
          }
        ]
      },
      containers: [
        {
          name: 'nginx-container',
          image: 'nginx:invalidtag',
          restartCount: 0,
          ready: false,
          state: 'waiting',
          waitingReason: 'ImagePullBackOff',
          waitingMessage: 'Failed to pull image nginx:invalidtag'
        }
      ]
    };

    store.syncClusterResources(cluster.id, [initialPod]);

    // Incident is created
    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    assert.equal(incidents.length, 1);
    const incident = incidents[0];
    assert.equal(incident.resourceName, 'nginx-test');
    assert.equal(incident.incidentType, 'ImagePullBackOff');
    assert.equal(incident.status, 'OPEN');

    // 2. Structured AI Remediation is proposed (proposal only, never executes)
    const proposedRemediation: StructuredRemediation = {
      id: `rem-prop-${incident.id}`,
      incidentId: incident.id,
      orgId: org.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      targetResource: { kind: 'Pod', namespace: 'default', name: 'nginx-test' },
      actionType: 'UPDATE_CONTAINER_IMAGE',
      parameters: {
        containerName: 'nginx-container',
        currentImage: 'nginx:invalidtag',
        proposedImage: 'nginx:1.25.4-alpine'
      },
      reasoning: {
        summary: 'Update container image to verified release',
        rootCause: 'Image tag invalidtag does not exist',
        whyRecommended: 'nginx:1.25.4-alpine is a known stable image',
        risk: 'LOW',
        expectedImpact: 'Pod transitions to Running',
        rollbackStrategy: 'Revert to previous tag',
        confidence: 0.95
      },
      changePreview: {
        resource: 'Pod',
        namespace: 'default',
        object: 'nginx-test',
        container: 'nginx-container',
        field: '/spec/containers/nginx-container/image',
        currentValue: 'nginx:invalidtag',
        proposedValue: 'nginx:1.25.4-alpine'
      },
      status: 'PROPOSED',
      createdAt: t0 + 1000,
      updatedAt: t0 + 1000
    };

    store.saveRemediation(proposedRemediation);

    // Verify incident cannot be approved with empty proposed image
    assert.throws(() => {
      store.approveRemediation(incident.id, org.id, { id: userId, name: 'SRE Approver' }, { proposedImage: '' });
    }, /valid target container image specified/);

    // 3. Human Approval Boundary
    const approvedRem = store.approveRemediation(
      incident.id,
      org.id,
      { id: userId, name: 'SRE Approver', email: 'sre@remediation.test' },
      { proposedImage: 'nginx:1.25.4-alpine', comments: 'Approved verified image tag' }
    );

    assert.equal(approvedRem.status, 'DISPATCHED');
    assert.equal(approvedRem.parameters.proposedImage, 'nginx:1.25.4-alpine');

    // Incident is IN_PROGRESS
    const incidentAfterApproval = store.getIncident(incident.id, org.id);
    assert.equal(incidentAfterApproval?.status, 'IN_PROGRESS');

    // Attempting to manually resolve an in-flight remediation incident must be rejected
    assert.throws(() => {
      store.updateIncident(incident.id, org.id, { status: 'RESOLVED' }, { id: userId, name: 'SRE Approver' });
    }, /Remediation-backed incidents require authoritative telemetry verification before resolution/);

    // In-memory Kubernetes state was NOT directly patched (no fake execution)
    const currentResources = store.getClusterResources(cluster.id, org.id);
    assert.equal(currentResources[0].status, 'Waiting');
    assert.equal(currentResources[0].health, 'CRITICAL');

    // 4. SkyOps Go Agent polls for actions
    const pendingActions = store.claimPendingRemediationActions(cluster.id);
    assert.equal(pendingActions.length, 1);
    const action = pendingActions[0];
    assert.equal(action.type, 'ReplacePodImage');
    assert.equal(action.target.name, 'nginx-test');
    assert.equal(action.target.container, 'nginx-container');
    assert.equal(action.expectedCurrentValue, 'nginx:invalidtag');
    assert.equal(action.proposedValue, 'nginx:1.25.4-alpine');
    assert.equal(action.status, 'DELIVERED');

    // 5. Agent reports mutation result
    const actionResult = store.recordRemediationResult(cluster.id, action.id, {
      success: true,
      message: 'Successfully replaced pod nginx-test with image nginx:1.25.4-alpine'
    });
    assert.ok(actionResult);
    assert.equal(actionResult?.status, 'SUCCEEDED');
    assert.ok(actionResult?.completedAt);

    // Incident is STILL NOT RESOLVED until fresh telemetry arrives
    const incidentAfterExecution = store.getIncident(incident.id, org.id);
    assert.equal(incidentAfterExecution?.status, 'IN_PROGRESS');

    // Timeline recorded REMEDIATION_EXECUTED with actor AGENT
    const timeline = store.getIncidentTimeline(incident.id, org.id);
    const execEvent = timeline.find((e) => e.type === 'REMEDIATION_EXECUTED' && e.actor.type === 'AGENT');
    assert.ok(execEvent, 'Timeline must contain REMEDIATION_EXECUTED event by AGENT');

    // 6. Stale telemetry (observed BEFORE or EQUAL to action.completedAt) cannot resolve incident
    const stalePod: KubernetesResource = {
      ...initialPod,
      updatedAt: actionResult.completedAt! - 100 // Stale timestamp
    };
    store.syncClusterResources(cluster.id, [stalePod]);
    const incidentAfterStaleSync = store.getIncident(incident.id, org.id);
    assert.equal(incidentAfterStaleSync?.status, 'IN_PROGRESS');

    // 7. Fresh telemetry observed AFTER action.completedAt with Running & Ready pod
    const freshPod: KubernetesResource = {
      id: `pod-${cluster.id}-nginx-test`,
      clusterId: cluster.id,
      name: 'nginx-test',
      namespace: 'default',
      kind: 'Pod',
      status: 'Running',
      health: 'HEALTHY',
      createdAt: t0 - 60000,
      updatedAt: actionResult.completedAt! + 2000, // Fresh observation
      specSummary: {
        containers: [{ name: 'nginx-container', image: 'nginx:1.25.4-alpine' }]
      },
      statusSummary: {
        observedState: 'Running',
        containerStates: [
          {
            name: 'nginx-container',
            state: 'running',
            ready: true,
            image: 'nginx:1.25.4-alpine'
          }
        ]
      }
    };

    store.syncClusterResources(cluster.id, [freshPod]);

    // 8. Backend verifies expected state and incident is now RESOLVED
    const resolvedIncident = store.getIncident(incident.id, org.id);
    assert.equal(resolvedIncident?.status, 'RESOLVED');
    assert.ok(resolvedIncident?.resolvedAt);

    // Verification timeline event exists
    const updatedTimeline = store.getIncidentTimeline(incident.id, org.id);
    const recoveryEvent = updatedTimeline.find((e) => e.type === 'RECOVERY');
    assert.ok(recoveryEvent, 'Timeline must contain RECOVERY event');

    // Structured remediation is marked VERIFIED_RESOLVED
    const finalRem = store.getRemediation(incident.id, org.id);
    assert.equal(finalRem?.status, 'VERIFIED_RESOLVED');
  });

  await t.test('Safety policy: Rejects automated remediation for unsupported resource kinds (e.g. Deployment, Node)', () => {
    const failingDeployment: KubernetesResource = {
      id: `dep-${cluster.id}-api-service`,
      clusterId: cluster.id,
      name: 'api-service',
      namespace: 'production',
      kind: 'Deployment',
      status: 'Degraded',
      health: 'CRITICAL',
      createdAt: Date.now() - 120000,
      updatedAt: Date.now(),
      specSummary: { replicas: 3 },
      statusSummary: { replicas: 3, readyReplicas: 0, availableReplicas: 0, updatedReplicas: 0 }
    };
    store.syncClusterResources(cluster.id, [failingDeployment]);
    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    const deploymentIncident = incidents.find((i) => i.resourceName === 'api-service')!;
    assert.ok(deploymentIncident);

    const proposal: StructuredRemediation = {
      id: `rem-deploy-${deploymentIncident.id}`,
      incidentId: deploymentIncident.id,
      orgId: org.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      targetResource: { kind: 'Deployment', namespace: 'production', name: 'api-service' },
      actionType: 'UPDATE_CONTAINER_IMAGE',
      parameters: {
        containerName: 'api-service',
        currentImage: 'api:v1',
        proposedImage: 'api:v2'
      },
      reasoning: {
        summary: 'Upgrade deployment image',
        rootCause: 'Image pull error',
        whyRecommended: 'Patch image',
        risk: 'HIGH',
        expectedImpact: 'Replicas recover',
        rollbackStrategy: 'Revert deployment',
        confidence: 0.9
      },
      status: 'PROPOSED',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    store.saveRemediation(proposal);

    // Approval fails because automated agent executor only supports Pod image replacement
    assert.throws(() => {
      store.approveRemediation(deploymentIncident.id, org.id, { id: userId, name: 'SRE Approver' });
    }, /Only Pods can be mutated safely/);
  });

  await t.test('Operator rejection cleanly transitions proposal to REJECTED without dispatching actions', () => {
    const failingWebPod: KubernetesResource = {
      id: `pod-${cluster.id}-web-pod`,
      clusterId: cluster.id,
      name: 'web-pod',
      namespace: 'default',
      kind: 'Pod',
      status: 'Waiting',
      health: 'CRITICAL',
      createdAt: Date.now() - 60000,
      updatedAt: Date.now(),
      specSummary: {},
      statusSummary: {},
      containers: [
        {
          name: 'web-pod',
          image: 'web:bad',
          restartCount: 0,
          ready: false,
          state: 'waiting',
          waitingReason: 'ImagePullBackOff',
          waitingMessage: 'Failed to pull image web:bad'
        }
      ]
    };
    store.syncClusterResources(cluster.id, [failingWebPod]);
    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    const rejectIncident = incidents.find((i) => i.resourceName === 'web-pod')!;
    assert.ok(rejectIncident);

    const proposal: StructuredRemediation = {
      id: `rem-reject-${rejectIncident.id}`,
      incidentId: rejectIncident.id,
      orgId: org.id,
      clusterId: cluster.id,
      clusterName: cluster.name,
      targetResource: { kind: 'Pod', namespace: 'default', name: 'web-pod' },
      actionType: 'UPDATE_CONTAINER_IMAGE',
      parameters: {
        containerName: 'web-pod',
        currentImage: 'web:bad',
        proposedImage: 'web:good'
      },
      reasoning: {
        summary: 'Upgrade pod image',
        rootCause: 'Image pull error',
        whyRecommended: 'Patch image',
        risk: 'LOW',
        expectedImpact: 'Pod recovers',
        rollbackStrategy: 'Revert',
        confidence: 0.9
      },
      status: 'PROPOSED',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    store.saveRemediation(proposal);

    const rejected = store.rejectRemediation(rejectIncident.id, org.id, { id: userId, name: 'SRE' }, 'Declined by human operator');
    assert.equal(rejected.status, 'REJECTED');

    // No actions should be queued for the agent
    const actions = store.claimPendingRemediationActions(cluster.id);
    const webActions = actions.filter((a) => a.target.name === 'web-pod');
    assert.equal(webActions.length, 0);
  });
});
