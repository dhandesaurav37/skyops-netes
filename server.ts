import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { generateHelmCommand, generateKubernetesManifest } from './server/manifestGenerator';
import { store } from './server/store';
import { KubernetesResource } from './src/types/index';

dotenv.config();

const app = express();
const PORT = 3000;

// Security & Parsing Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Structured Request Logging ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// --- Auth & Tenant Context Middleware ---
interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; name: string };
  orgId?: string;
  userRole?: string;
}

function tenantAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const orgHeader = req.headers['x-org-id'] as string;
  const userEmail = (req.headers['x-user-email'] as string) || 'sre-lead@acme.corp';
  const userName = (req.headers['x-user-name'] as string) || 'Alex Rivera (Staff SRE)';

  const user = store.getOrCreateUser(userEmail, userName);
  req.user = user;

  const userOrgs = store.getOrganizationsForUser(user.id);
  const targetOrgId = orgHeader || (userOrgs.length > 0 ? userOrgs[0].id : 'org-production-sre');

  const access = store.checkUserOrgAccess(user.id, targetOrgId);
  if (!access.hasAccess && userOrgs.length > 0) {
    // Default to first accessible org
    req.orgId = userOrgs[0].id;
    req.userRole = store.checkUserOrgAccess(user.id, userOrgs[0].id).role;
  } else {
    req.orgId = targetOrgId;
    req.userRole = access.role || 'OWNER';
  }

  next();
}

// --- Agent Bearer Authentication Middleware ---
interface AgentRequest extends Request {
  clusterId?: string;
  orgId?: string;
}

function agentAuth(req: AgentRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed Bearer token' });
  }

  const rawToken = authHeader.substring(7).trim();
  const verified = store.authenticateAgentToken(rawToken);
  if (!verified) {
    return res.status(403).json({ error: 'Forbidden: Invalid or revoked agent token' });
  }

  req.clusterId = verified.clusterId;
  req.orgId = verified.orgId;
  next();
}

// Helper to resolve public API / SaaS endpoint URL for remote Kubernetes agents
function getPublicServerUrl(req?: Request): string {
  // If explicitly configured in environment:
  if (
    process.env.SKYOPS_API_URL &&
    process.env.SKYOPS_API_URL.startsWith('http') &&
    !process.env.SKYOPS_API_URL.includes('localhost') &&
    process.env.SKYOPS_API_URL !== 'https://skyops.ai.studio'
  ) {
    return process.env.SKYOPS_API_URL.replace(/\/+$/, '');
  }
  if (process.env.APP_URL && process.env.APP_URL.startsWith('http') && !process.env.APP_URL.includes('localhost')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  if (req) {
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string);
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    if (forwardedHost && !forwardedHost.includes('localhost')) {
      return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
    }
  }
  return process.env.APP_URL || 'https://ais-dev-jrvfxsw2z3hsomufnmypgw-811563557432.asia-southeast1.run.app';
}

// ==========================================
// API ROUTES (/api/v1/...)
// ==========================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SkyOps Central Ingestion API', version: 'v1.4.2' });
});

// --- Auth & Session ---
app.post('/api/v1/auth/session', tenantAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const orgs = store.getOrganizationsForUser(user.id);
  const currentOrg = orgs.find((o) => o.id === req.orgId) || orgs[0];
  const members = store.getOrgMembers(currentOrg.id);

  res.json({
    user,
    currentOrg,
    organizations: orgs,
    role: req.userRole || 'OWNER',
    members
  });
});

// --- Organizations ---
app.get('/api/v1/orgs', tenantAuth, (req: AuthenticatedRequest, res) => {
  const orgs = store.getOrganizationsForUser(req.user!.id);
  res.json({ organizations: orgs });
});

app.post('/api/v1/orgs', tenantAuth, (req: AuthenticatedRequest, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Organization name is required' });
  }
  const org = store.createOrganization(name.trim(), req.user!.id);
  res.status(201).json({ organization: org });
});

// --- Clusters ---
app.get('/api/v1/clusters', tenantAuth, (req: AuthenticatedRequest, res) => {
  const clusters = store.getClusters(req.orgId!);
  res.json({ clusters });
});

app.post('/api/v1/clusters', tenantAuth, (req: AuthenticatedRequest, res) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Cluster name is required' });
  }

  const { cluster, rawToken, connectionCode, installKey } = store.createCluster(req.orgId!, name.trim(), description);
  res.status(201).json({ cluster, token: rawToken, connectionCode, installKey });
});

app.get('/api/v1/clusters/:id', tenantAuth, (req: AuthenticatedRequest, res) => {
  const cluster = store.getCluster(req.params.id, req.orgId!);
  if (!cluster) {
    return res.status(404).json({ error: 'Cluster not found' });
  }
  res.json({ cluster });
});

// Connect cluster using connection code handshake
app.post('/api/v1/clusters/:id/connect', tenantAuth, (req: AuthenticatedRequest, res) => {
  const { connectionCode } = req.body;
  if (!connectionCode || typeof connectionCode !== 'string') {
    return res.status(400).json({ error: 'Connection code is required' });
  }

  try {
    const updated = store.verifyClusterConnection(req.params.id, req.orgId!, connectionCode);
    res.json({ success: true, cluster: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to verify connection code' });
  }
});

// Regenerate credentials for cluster
app.post('/api/v1/clusters/:id/regenerate-token', tenantAuth, (req: AuthenticatedRequest, res) => {
  if (req.userRole !== 'OWNER' && req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Only OWNER and ADMIN roles can regenerate agent credentials' });
  }

  try {
    const { cluster, rawToken, connectionCode, installKey } = store.regenerateClusterCredentials(req.params.id, req.orgId!);
    res.json({ success: true, cluster, token: rawToken, connectionCode, installKey });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Cluster not found' });
  }
});

// Disconnect agent from cluster
app.post('/api/v1/clusters/:id/disconnect', tenantAuth, (req: AuthenticatedRequest, res) => {
  if (req.userRole !== 'OWNER' && req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Only OWNER and ADMIN roles can disconnect clusters' });
  }

  const success = store.disconnectCluster(req.params.id, req.orgId!);
  if (!success) {
    return res.status(404).json({ error: 'Cluster not found' });
  }
  res.json({ success: true, message: 'Cluster agent disconnected successfully' });
});

app.delete('/api/v1/clusters/:id', tenantAuth, (req: AuthenticatedRequest, res) => {
  if (req.userRole !== 'OWNER' && req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Only OWNER and ADMIN roles can delete clusters' });
  }
  const deleted = store.deleteCluster(req.params.id, req.orgId!);
  if (!deleted) {
    return res.status(404).json({ error: 'Cluster not found' });
  }
  res.json({ success: true, message: 'Cluster and associated telemetry deleted' });
});

// Get manifests for cluster
app.get('/api/v1/clusters/:id/manifests', tenantAuth, (req: AuthenticatedRequest, res) => {
  const cluster = store.getCluster(req.params.id, req.orgId!, true);
  if (!cluster) {
    return res.status(404).json({ error: 'Cluster not found' });
  }

  const serverUrl = getPublicServerUrl(req);
  const token = cluster.agentToken || 'sky_agent_configured_token';

  const manifest = generateKubernetesManifest({
    clusterId: cluster.id,
    clusterName: cluster.name,
    token,
    serverUrl
  });

  const helmCommand = generateHelmCommand({
    clusterId: cluster.id,
    clusterName: cluster.name,
    token,
    serverUrl
  });

  const installKeyParam = cluster.installKey ? `?key=${cluster.installKey}` : '';
  const installCommand = `kubectl apply -f ${serverUrl}/api/v1/clusters/${cluster.id}/manifest.yaml${installKeyParam}`;
  const manifestDownloadUrl = `${serverUrl}/api/v1/clusters/${cluster.id}/manifest.yaml${installKeyParam}`;

  res.json({
    clusterId: cluster.id,
    clusterName: cluster.name,
    token,
    connectionCode: cluster.connectionCode,
    installKey: cluster.installKey,
    serverUrl,
    agentVersion: 'v1.4.2',
    namespace: 'skyops-system',
    kubectlManifest: manifest,
    helmCommand,
    installCommand,
    manifestDownloadUrl
  });
});

// Direct raw YAML manifest stream for direct kubectl apply
app.get('/api/v1/clusters/:id/manifest.yaml', (req, res) => {
  const { id } = req.params;
  const providedKey = (req.query.key as string) || (req.query.installToken as string) || (req.query.token as string);
  const authHeader = req.headers.authorization;

  // Locate cluster
  const cluster = store.getClusterByIdInternal(id);
  if (!cluster) {
    return res.status(404).type('text/plain').send('# Error 404: Kubernetes cluster not found in SkyOps\n');
  }

  // Security Verification:
  // 1. Verify if request provides a valid, unexpired short-lived installation key
  // 2. OR verify if request provides valid Agent Bearer Token
  // 3. OR verify if request is from an authenticated tenant session
  let isAuthorized = false;

  if (providedKey && cluster.installKey && cluster.installKey === providedKey) {
    if (!cluster.installKeyExpiresAt || Date.now() <= cluster.installKeyExpiresAt) {
      isAuthorized = true;
    }
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    const verified = store.authenticateAgentToken(bearer);
    if (verified && verified.clusterId === id) {
      isAuthorized = true;
    }
  } else if (req.headers['x-user-email']) {
    // Authenticated dashboard user previewing manifest
    isAuthorized = true;
  }

  if (!isAuthorized) {
    return res
      .status(403)
      .type('text/plain')
      .send(
        '# Error 403 Forbidden: Invalid, missing, or expired manifest installation key.\n# Please generate a new install command from the SkyOps Dashboard.\n'
      );
  }

  const serverUrl = getPublicServerUrl(req);
  const token = cluster.agentToken || 'sky_agent_configured_token';

  const manifest = generateKubernetesManifest({
    clusterId: cluster.id,
    clusterName: cluster.name,
    token,
    serverUrl
  });

  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="skyops-agent-${cluster.id}.yaml"`);
  res.status(200).send(manifest);
});

app.get('/api/v1/clusters/:id/resources', tenantAuth, (req: AuthenticatedRequest, res) => {
  const resources = store.getClusterResources(req.params.id, req.orgId!);
  res.json({ resources });
});

// --- Agent Ingestion Endpoints ---
app.post('/api/v1/agent/register', agentAuth, (req: AgentRequest, res) => {
  const { agentVersion, k8sVersion } = req.body;
  try {
    const result = store.registerAgent(req.clusterId!, agentVersion, k8sVersion);
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Cluster registration failed' });
  }
});

// --- Agent Ingestion Endpoints ---
app.post('/api/v1/agent/heartbeat', agentAuth, (req: AgentRequest, res) => {
  const { agentVersion, k8sVersion, nodeCount, podCount } = req.body;
  const recorded = store.recordAgentHeartbeat(
    req.clusterId!,
    agentVersion || 'v1.4.2',
    k8sVersion,
    nodeCount,
    podCount
  );

  if (!recorded) {
    return res.status(404).json({ error: 'Cluster associated with agent token not found' });
  }

  res.json({
    status: 'ACK',
    clusterId: req.clusterId,
    timestamp: Date.now(),
    nextHeartbeatSeconds: 30
  });
});

app.post('/api/v1/agent/telemetry', agentAuth, (req: AgentRequest, res) => {
  const { items, resources } = req.body;

  if (Array.isArray(resources)) {
    store.syncClusterResources(req.clusterId!, resources as KubernetesResource[]);
  } else if (Array.isArray(items)) {
    // Process items from queue
    const extractedResources: KubernetesResource[] = [];
    for (const item of items) {
      if (item.payload && item.payload.kind && item.payload.name) {
        extractedResources.push(item.payload as KubernetesResource);
      }
    }
    if (extractedResources.length > 0) {
      store.syncClusterResources(req.clusterId!, extractedResources);
    }
  }

  res.json({
    status: 'PROCESSED',
    clusterId: req.clusterId,
    timestamp: Date.now()
  });
});

// --- Incidents Management ---
app.get('/api/v1/incidents', tenantAuth, (req: AuthenticatedRequest, res) => {
  const { status, severity, clusterId, namespace, search } = req.query;

  const incidents = store.getIncidents(req.orgId!, {
    status: status as any,
    severity: severity as any,
    clusterId: clusterId as string,
    namespace: namespace as string,
    search: search as string
  });

  res.json({ incidents });
});

app.get('/api/v1/incidents/:id', tenantAuth, (req: AuthenticatedRequest, res) => {
  const incident = store.getIncident(req.params.id, req.orgId!);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  const timeline = store.getIncidentTimeline(incident.id, req.orgId!);
  const notes = store.getIncidentNotes(incident.id, req.orgId!);

  res.json({ incident, timeline, notes });
});

app.patch('/api/v1/incidents/:id', tenantAuth, (req: AuthenticatedRequest, res) => {
  if (req.userRole === 'VIEWER') {
    return res.status(403).json({ error: 'Read-only VIEWER role cannot modify incident properties' });
  }

  const { status, severity, title, assignee } = req.body;
  const updated = store.updateIncident(
    req.params.id,
    req.orgId!,
    { status, severity, title, assignee },
    { id: req.user!.id, name: req.user!.name }
  );

  if (!updated) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  res.json({ incident: updated });
});

app.get('/api/v1/incidents/:id/timeline', tenantAuth, (req: AuthenticatedRequest, res) => {
  const timeline = store.getIncidentTimeline(req.params.id, req.orgId!);
  res.json({ timeline });
});

app.get('/api/v1/incidents/:id/notes', tenantAuth, (req: AuthenticatedRequest, res) => {
  const notes = store.getIncidentNotes(req.params.id, req.orgId!);
  res.json({ notes });
});

app.post('/api/v1/incidents/:id/notes', tenantAuth, (req: AuthenticatedRequest, res) => {
  if (req.userRole === 'VIEWER') {
    return res.status(403).json({ error: 'Read-only VIEWER role cannot add investigation notes' });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Note content cannot be empty' });
  }

  const note = store.addIncidentNote(
    req.params.id,
    req.orgId!,
    { id: req.user!.id, name: req.user!.name, email: req.user!.email },
    content
  );

  if (!note) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  res.status(201).json({ note });
});

// --- Overview Dashboard Metrics ---
app.get('/api/v1/overview', tenantAuth, (req: AuthenticatedRequest, res) => {
  const metrics = store.getOverviewMetrics(req.orgId!);
  const clusters = store.getClusters(req.orgId!);
  const recentIncidents = store.getIncidents(req.orgId!).slice(0, 8);
  const recentActivity = store.getRecentActivity(req.orgId!, 12);

  res.json({
    metrics,
    clusters,
    recentIncidents,
    recentActivity
  });
});

// --- Development & QA Scenario Simulation ---
app.post('/api/v1/dev/simulate-scenario', tenantAuth, (req: AuthenticatedRequest, res) => {
  const { clusterId, scenario } = req.body;
  if (!clusterId || !scenario) {
    return res.status(400).json({ error: 'clusterId and scenario are required' });
  }

  const result = store.simulateScenario(req.orgId!, clusterId, scenario);
  res.json(result);
});

// --- API 404 Handler (ensures no /api/* route falls through to HTML SPA handler) ---
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// --- API Global Error Handler ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[SkyOps Server Error]', err);
  if (req.path.startsWith('/api/')) {
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  } else {
    next(err);
  }
});

// ==========================================
// VITE MIDDLEWARE / SPA STATIC HANDLER
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SkyOps Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
});
