import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from './store';
import { KubernetesResource } from '../src/types/index';

test('DataStore Multi-Tenant & Agent Lifecycle Suite', async (t) => {
  // Setup Test Organization
  const testOwnerId = 'user-test-sre';
  store.upsertUser({ id: testOwnerId, email: 'sre@example.com', name: 'SRE Lead' });
  const org = store.createOrganization('Reliability Org', testOwnerId);

  await t.test('Cluster onboarding generates secure token, installKey, and single-use pairing key', () => {
    const { cluster, rawToken, connectionCode, installKey } = store.createCluster(org.id, 'prod-us-east-1');

    assert.ok(cluster.id.startsWith('cls-'));
    assert.equal(cluster.name, 'prod-us-east-1');
    assert.equal(cluster.orgId, org.id);
    assert.equal(cluster.status, 'pending');
    assert.equal(cluster.agentStatus, 'PENDING');
    assert.ok(rawToken.startsWith('sky_agent_'));
    assert.ok(connectionCode.startsWith('SKYOPS-'));
    assert.ok(installKey.startsWith('sky_inst_'));

    // Authenticate with raw token
    const authSuccess = store.authenticateAgentToken(rawToken);
    assert.ok(authSuccess);
    assert.equal(authSuccess?.clusterId, cluster.id);
    assert.equal(authSuccess?.orgId, org.id);

    // Reject forged / invalid token
    const authForged = store.authenticateAgentToken('sky_agent_invalid_token_123');
    assert.equal(authForged, null);
  });

  await t.test('Agent registration and heartbeat lifecycle update cluster diagnostics', () => {
    const { cluster, rawToken } = store.createCluster(org.id, 'staging-eu-west-1');
    
    // Register agent
    const regResult = store.registerAgent(cluster.id, 'v1.5.0', 'v1.31.1');
    assert.equal(regResult.status, 'REGISTERED');
    assert.equal(regResult.clusterId, cluster.id);

    // Verify cluster updated
    const updated = store.getCluster(cluster.id, org.id);
    assert.ok(updated);
    assert.equal(updated?.agentStatus, 'CONNECTED');
    assert.equal(updated?.agentVersion, 'v1.5.0');
    assert.equal(updated?.k8sVersion, 'v1.31.1');

    // Heartbeat updates node and pod counts
    const heartbeatOk = store.recordAgentHeartbeat(cluster.id, 'v1.5.0', 'v1.31.1', 8, 45);
    assert.equal(heartbeatOk, true);

    const afterHeartbeat = store.getCluster(cluster.id, org.id);
    assert.equal(afterHeartbeat?.nodeCount, 8);
    assert.equal(afterHeartbeat?.podCount, 45);
  });

  await t.test('Multi-cluster isolation prevents cross-cluster data leakage', () => {
    const { cluster: clusterA, rawToken: tokenA } = store.createCluster(org.id, 'cluster-alpha');
    const { cluster: clusterB, rawToken: tokenB } = store.createCluster(org.id, 'cluster-beta');

    const authA = store.authenticateAgentToken(tokenA);
    const authB = store.authenticateAgentToken(tokenB);

    assert.notEqual(authA?.clusterId, authB?.clusterId);
    assert.equal(authA?.clusterId, clusterA.id);
    assert.equal(authB?.clusterId, clusterB.id);

    // Sync telemetry to Cluster A
    const resourceA: KubernetesResource = {
      id: `${clusterA.id}-pod-default-api-server`,
      clusterId: clusterA.id,
      kind: 'Pod',
      name: 'api-server-78bc',
      namespace: 'default',
      status: 'Running',
      health: 'HEALTHY',
      createdAt: Date.now() - 60000,
      updatedAt: Date.now(),
      specSummary: {},
      statusSummary: {},
      containers: [{ name: 'api', image: 'api:v1', restartCount: 0, ready: true, state: 'running' }]
    };

    store.syncClusterResources(clusterA.id, [resourceA]);

    const resA = store.getClusterResources(clusterA.id, org.id);
    const resB = store.getClusterResources(clusterB.id, org.id);

    assert.equal(resA.length, 1);
    assert.equal(resA[0].name, 'api-server-78bc');
    assert.equal(resB.length, 0); // Cluster B has no resources
  });

  await t.test('Incident detection, deduplication, timeline tracking, and auto-recovery', () => {
    const { cluster } = store.createCluster(org.id, 'prod-workloads');

    // 1. Ingest failing pod (CrashLoopBackOff)
    const failingPod: KubernetesResource = {
      id: `${cluster.id}-pod-payment-payment-svc`,
      clusterId: cluster.id,
      kind: 'Pod',
      name: 'payment-svc-xyz',
      namespace: 'payment',
      status: 'CrashLoopBackOff',
      health: 'CRITICAL',
      createdAt: Date.now() - 120000,
      updatedAt: Date.now(),
      specSummary: {},
      statusSummary: {},
      containers: [
        {
          name: 'payment',
          image: 'payment-svc:v2.1',
          restartCount: 6,
          ready: false,
          state: 'waiting',
          waitingReason: 'CrashLoopBackOff',
          waitingMessage: 'Back-off 5m0s restarting failed container',
          exitCode: 1
        }
      ]
    };

    store.syncClusterResources(cluster.id, [failingPod]);

    const incidents = store.getIncidents(org.id, { clusterId: cluster.id });
    assert.equal(incidents.length, 1);
    const incident = incidents[0];
    assert.equal(incident.incidentType, 'CrashLoopBackOff');
    assert.equal(incident.status, 'OPEN');
    assert.equal(incident.occurrenceCount, 1);
    assert.equal(incident.resourceName, 'payment-svc-xyz');

    // 2. Deduplication & Stability: Send second scrape with same failure
    store.syncClusterResources(cluster.id, [failingPod]);

    const incidentsAfterSecondScrape = store.getIncidents(org.id, { clusterId: cluster.id });
    assert.equal(incidentsAfterSecondScrape.length, 1); // No duplicate incident created
    assert.equal(incidentsAfterSecondScrape[0].id, incident.id);
    assert.equal(incidentsAfterSecondScrape[0].occurrenceCount, 1, 'Repeat observation of active failure must NOT increment occurrence count');

    // 3. Auto-recovery: Send updated healthy pod telemetry
    const recoveredPod: KubernetesResource = {
      ...failingPod,
      status: 'Running',
      health: 'HEALTHY',
      updatedAt: Date.now(),
      specSummary: {},
      statusSummary: {},
      containers: [
        {
          name: 'payment',
          image: 'payment-svc:v2.1',
          restartCount: 6,
          ready: true,
          state: 'running'
        }
      ]
    };

    store.syncClusterResources(cluster.id, [recoveredPod]);

    const incidentsAfterRecovery = store.getIncidents(org.id, { clusterId: cluster.id });
    assert.equal(incidentsAfterRecovery.length, 1);
    assert.equal(incidentsAfterRecovery[0].status, 'RESOLVED');
    assert.ok(incidentsAfterRecovery[0].resolvedAt);
    assert.equal(incidentsAfterRecovery[0].technicalDetails.rootCauseCategory, 'CRASH', 'Recovery must preserve the RCA history');

    // 4. Recurrence: Same failure detected again after recovery -> occurrence increments to 2
    store.syncClusterResources(cluster.id, [failingPod]);
    const incidentsAfterRecurrence = store.getIncidents(org.id, { clusterId: cluster.id });
    assert.equal(incidentsAfterRecurrence.length, 1);
    assert.equal(incidentsAfterRecurrence[0].id, incident.id);
    assert.equal(incidentsAfterRecurrence[0].status, 'OPEN');
    assert.equal(incidentsAfterRecurrence[0].occurrenceCount, 2, 'Recurrence after resolution must increment occurrence count to 2');

    // 5. Active observation while in 2nd occurrence -> remains 2
    store.syncClusterResources(cluster.id, [failingPod]);
    const incidentsAfterSecondPulse = store.getIncidents(org.id, { clusterId: cluster.id });
    assert.equal(incidentsAfterSecondPulse[0].occurrenceCount, 2, 'Unchanged active failure must remain at 2');

    // Verify timeline has detection, recovery, and occurrence events
    const timeline = store.getIncidentTimeline(incident.id, org.id);
    assert.ok(timeline.length >= 3);
    assert.ok(timeline.some((e) => e.type === 'DETECTION'));
    assert.ok(timeline.some((e) => e.type === 'RECOVERY'));
    assert.ok(timeline.some((e) => e.type === 'OCCURRENCE'));
  });

  await t.test('Occurrence Lifecycle Regression: 10+ active observations remain 1x, resolves, recurs to 2x, remains 2x, independent fingerprints', () => {
    const { cluster } = store.createCluster(org.id, 'prod-occurrence-test');

    const imagePullPodA: KubernetesResource = {
      id: `${cluster.id}-pod-auth-auth-service`,
      clusterId: cluster.id,
      kind: 'Pod',
      name: 'auth-service-abc',
      namespace: 'auth',
      status: 'ImagePullBackOff',
      health: 'CRITICAL',
      createdAt: Date.now() - 60000,
      updatedAt: Date.now(),
      specSummary: {},
      statusSummary: {},
      containers: [
        {
          name: 'auth',
          image: 'registry.internal/auth:v999',
          restartCount: 0,
          ready: false,
          state: 'waiting',
          waitingReason: 'ImagePullBackOff',
          waitingMessage: 'Back-off pulling image registry.internal/auth:v999'
        }
      ]
    };

    const crashPodB: KubernetesResource = {
      id: `${cluster.id}-pod-billing-billing-worker`,
      clusterId: cluster.id,
      kind: 'Pod',
      name: 'billing-worker-xyz',
      namespace: 'billing',
      status: 'CrashLoopBackOff',
      health: 'CRITICAL',
      createdAt: Date.now() - 60000,
      updatedAt: Date.now(),
      specSummary: {},
      statusSummary: {},
      containers: [
        {
          name: 'worker',
          image: 'registry.internal/billing:v1.2',
          restartCount: 3,
          ready: false,
          state: 'waiting',
          waitingReason: 'CrashLoopBackOff',
          waitingMessage: 'Back-off 10s restarting failed container',
          exitCode: 1
        }
      ]
    };

    // Step 1: First detection -> occurrences = 1
    store.syncClusterResources(cluster.id, [imagePullPodA, crashPodB]);
    let incA = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'auth' })[0];
    let incB = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'billing' })[0];
    assert.equal(incA.occurrenceCount, 1);
    assert.equal(incA.status, 'OPEN');
    assert.equal(incB.occurrenceCount, 1);
    assert.equal(incB.status, 'OPEN');
    assert.notEqual(incA.id, incB.id, 'Different fingerprints must create independent incident tickets');

    // Step 2: 12 identical consecutive telemetry scrape cycles while continuously OPEN -> occurrences MUST remain 1
    for (let cycle = 1; cycle <= 12; cycle++) {
      store.syncClusterResources(cluster.id, [imagePullPodA, crashPodB]);
    }
    incA = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'auth' })[0];
    incB = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'billing' })[0];
    assert.equal(incA.occurrenceCount, 1, '12 consecutive active scrapes must still have occurrenceCount = 1');
    assert.equal(incB.occurrenceCount, 1, '12 consecutive active scrapes must still have occurrenceCount = 1');

    // Step 3: Pod A recovers -> incA becomes RESOLVED, incB remains OPEN
    const recoveredPodA: KubernetesResource = {
      ...imagePullPodA,
      status: 'Running',
      health: 'HEALTHY',
      updatedAt: Date.now(),
      containers: [
        {
          name: 'auth',
          image: 'registry.internal/auth:v999',
          restartCount: 0,
          ready: true,
          state: 'running'
        }
      ]
    };
    store.syncClusterResources(cluster.id, [recoveredPodA, crashPodB]);
    incA = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'auth' })[0];
    incB = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'billing' })[0];
    assert.equal(incA.status, 'RESOLVED');
    assert.ok(incA.resolvedAt);
    assert.equal(incB.status, 'OPEN');
    assert.equal(incB.occurrenceCount, 1);

    // Step 4: Same failure happens again on Pod A -> incA reopens with occurrences = 2
    store.syncClusterResources(cluster.id, [imagePullPodA, crashPodB]);
    incA = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'auth' })[0];
    assert.equal(incA.status, 'OPEN');
    assert.equal(incA.occurrenceCount, 2, 'Recurrence after resolution must increment occurrences to 2');
    assert.equal(incA.resolvedAt, null);

    // Step 5: Same failure remains active after second occurrence -> remains 2 across multiple scrapes
    for (let cycle = 1; cycle <= 5; cycle++) {
      store.syncClusterResources(cluster.id, [imagePullPodA, crashPodB]);
    }
    incA = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'auth' })[0];
    assert.equal(incA.occurrenceCount, 2, 'Second occurrence must remain at 2 across repeated observations');

    // Step 6: Pod A recovers again -> becomes RESOLVED
    store.syncClusterResources(cluster.id, [recoveredPodA, crashPodB]);
    incA = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'auth' })[0];
    assert.equal(incA.status, 'RESOLVED');

    // Step 7: Pod A fails a third independent time -> becomes occurrences = 3
    store.syncClusterResources(cluster.id, [imagePullPodA, crashPodB]);
    incA = store.getIncidents(org.id, { clusterId: cluster.id, namespace: 'auth' })[0];
    assert.equal(incA.status, 'OPEN');
    assert.equal(incA.occurrenceCount, 3, 'Third failure after recovery must increment occurrences to 3');
  });

  await t.test('Partial scrape does not falsely resolve active incidents; complete snapshot reconciles deleted resources', () => {
    const { cluster } = store.createCluster(org.id, 'prod-safety-cluster');

    const oomPod: KubernetesResource = {
      id: `${cluster.id}-pod-default-analytics-worker`,
      clusterId: cluster.id,
      kind: 'Pod',
      name: 'analytics-worker-abc',
      namespace: 'default',
      status: 'OOMKilled',
      health: 'CRITICAL',
      createdAt: Date.now() - 60000,
      updatedAt: Date.now(),
      specSummary: {},
      statusSummary: {},
      containers: [
        {
          name: 'worker',
          image: 'analytics:v1',
          restartCount: 2,
          ready: false,
          state: 'terminated',
          terminationReason: 'OOMKilled',
          exitCode: 137
        }
      ]
    };

    // 1. Initial detection
    store.syncClusterResources(cluster.id, [oomPod]);
    let active = store.getIncidents(org.id, { clusterId: cluster.id, status: 'OPEN' });
    assert.equal(active.length, 1);

    // 2. Transient partial scrape (empty or partial without snapshotComplete) -> Must NOT auto-resolve
    store.syncClusterResources(cluster.id, [], false);
    active = store.getIncidents(org.id, { clusterId: cluster.id, status: 'OPEN' });
    assert.equal(active.length, 1, 'Transient partial scrape must not falsely auto-resolve active incident');

    // 3. Explicit complete snapshot missing the pod -> Reconciles deleted resource
    store.syncClusterResources(cluster.id, [], true);
    active = store.getIncidents(org.id, { clusterId: cluster.id, status: 'OPEN' });
    assert.equal(active.length, 0, 'Complete snapshot must reconcile deleted resource');
    const resolved = store.getIncidents(org.id, { clusterId: cluster.id, status: 'RESOLVED' });
    assert.equal(resolved.length, 1);
  });
});
