import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  AuthenticatedAgentRequest,
  AuthenticatedUserRequest,
  requireAgentAuth,
  requireOrgMembership,
  requireRole,
  requireUserAuth
} from './server/auth';
import { generateHelmCommand, generateKubernetesManifest } from './server/manifestGenerator';
import { store } from './server/store';
import { KubernetesResource } from './src/types/index';

dotenv.config();

const app = express();
const PORT = 3000;

// Security & Parsing Middlewares
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-org-id']
  })
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

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

// Helper to resolve public API / SaaS endpoint URL for remote Kubernetes agents
function getPublicServerUrl(req?: Request): string {
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
  res.json({
    status: 'ok',
    service: 'SkyOps Central Ingestion API',
    version: 'v1.4.2',
    timestamp: Date.now()
  });
});

// --- Auth & Session ---
app.post('/api/v1/auth/session', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const user = req.user!;
  const orgs = store.getOrganizationsForUser(user.id);
  const currentOrg = orgs.find((o) => o.id === req.orgId) || orgs[0];
  const members = currentOrg ? store.getOrgMembers(currentOrg.id) : [];

  res.json({
    user,
    currentOrg,
    organizations: orgs,
    role: req.userRole || 'OWNER',
    members
  });
});

app.get('/api/v1/auth/me', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const user = req.user!;
  const orgs = store.getOrganizationsForUser(user.id);
  const currentOrg = orgs.find((o) => o.id === req.orgId) || orgs[0];

  res.json({
    user,
    currentOrg,
    role: req.userRole || 'OWNER'
  });
});

// --- Organizations ---
app.get('/api/v1/orgs', requireUserAuth, (req: AuthenticatedUserRequest, res) => {
  const orgs = store.getOrganizationsForUser(req.user!.id);
  res.json({ organizations: orgs });
});

const CreateOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(60)
});

app.post('/api/v1/orgs', requireUserAuth, (req: AuthenticatedUserRequest, res) => {
  const parsed = CreateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid organization payload' });
  }

  const org = store.createOrganization(parsed.data.name.trim(), req.user!.id);
  res.status(201).json({ organization: org });
});

app.get('/api/v1/orgs/members', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const members = store.getOrgMembers(req.orgId!);
  res.json({ members });
});

// --- Clusters ---
app.get('/api/v1/clusters', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const clusters = store.getClusters(req.orgId!);
  res.json({ clusters });
});

const CreateClusterSchema = z.object({
  name: z.string().min(2, 'Cluster name must be at least 2 characters').max(60),
  description: z.string().max(300).optional()
});

app.post('/api/v1/clusters', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const parsed = CreateClusterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid cluster payload' });
  }

  const { cluster, rawToken, connectionCode, installKey } = store.createCluster(
    req.orgId!,
    parsed.data.name.trim(),
    parsed.data.description
  );
  res.status(201).json({ cluster, token: rawToken, connectionCode, installKey });
});

app.get('/api/v1/clusters/:id', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const cluster = store.getCluster(req.params.id, req.orgId!);
  if (!cluster) {
    return res.status(404).json({ error: 'Cluster not found' });
  }
  res.json({ cluster });
});

// Connect cluster using connection code handshake (single-use pairing key)
const ConnectClusterSchema = z.object({
  connectionCode: z.string().min(4, 'Connection code is required')
});

app.post('/api/v1/clusters/:id/connect', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const parsed = ConnectClusterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid connection code' });
  }

  try {
    const updated = store.verifyClusterConnection(req.params.id, req.orgId!, parsed.data.connectionCode);
    res.json({ success: true, cluster: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to verify connection code' });
  }
});

// Regenerate credentials for cluster
app.post(
  '/api/v1/clusters/:id/regenerate-token',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  (req: AuthenticatedUserRequest, res) => {
    try {
      const { cluster, rawToken, connectionCode, installKey } = store.regenerateClusterCredentials(req.params.id, req.orgId!);
      res.json({ success: true, cluster, token: rawToken, connectionCode, installKey });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Cluster not found' });
    }
  }
);

// Disconnect agent from cluster
app.post(
  '/api/v1/clusters/:id/disconnect',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  (req: AuthenticatedUserRequest, res) => {
    const success = store.disconnectCluster(req.params.id, req.orgId!);
    if (!success) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json({ success: true, message: 'Cluster agent disconnected successfully' });
  }
);

app.delete(
  '/api/v1/clusters/:id',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN']),
  (req: AuthenticatedUserRequest, res) => {
    const deleted = store.deleteCluster(req.params.id, req.orgId!);
    if (!deleted) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json({ success: true, message: 'Cluster and associated telemetry deleted' });
  }
);

// Get manifests for cluster
app.get('/api/v1/clusters/:id/manifests', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
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
const handleManifestDownload = (req: Request, res: Response) => {
  const { id } = req.params;
  const providedKey = (req.query.key as string) || (req.query.installToken as string) || (req.query.token as string);
  const authHeader = req.headers.authorization;

  const cluster = store.getClusterByIdInternal(id);
  if (!cluster) {
    return res.status(404).type('text/plain').send('# Error 404: Kubernetes cluster not found in SkyOps\n');
  }

  // Security Verification:
  // 1. Verify if request provides a valid, unexpired short-lived installation key
  // 2. OR verify if request provides valid Agent Bearer Token
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
};

app.get('/api/v1/clusters/:id/manifest.yaml', handleManifestDownload);
app.get('/api/v1/clusters/:id/manifests/download', handleManifestDownload);

app.get('/api/v1/clusters/:id/resources', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const resources = store.getClusterResources(req.params.id, req.orgId!);
  res.json({ resources });
});

// --- Agent Ingestion Endpoints (Separately Authenticated via requireAgentAuth) ---
app.post('/api/v1/agent/register', requireAgentAuth, (req: AuthenticatedAgentRequest, res) => {
  const { agentVersion, k8sVersion } = req.body;
  try {
    const result = store.registerAgent(req.clusterId!, agentVersion, k8sVersion);
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Cluster registration failed' });
  }
});

app.post('/api/v1/agent/heartbeat', requireAgentAuth, (req: AuthenticatedAgentRequest, res) => {
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

app.post('/api/v1/agent/telemetry', requireAgentAuth, (req: AuthenticatedAgentRequest, res) => {
  const { items, resources } = req.body;

  if (Array.isArray(resources)) {
    store.syncClusterResources(req.clusterId!, resources as KubernetesResource[]);
  } else if (Array.isArray(items)) {
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
app.get('/api/v1/incidents', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
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

app.get('/api/v1/incidents/:id', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const incident = store.getIncident(req.params.id, req.orgId!);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  const timeline = store.getIncidentTimeline(incident.id, req.orgId!);
  const notes = store.getIncidentNotes(incident.id, req.orgId!);

  res.json({ incident, timeline, notes });
});

const UpdateIncidentSchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
  title: z.string().min(3).max(200).optional(),
  assignee: z
    .object({
      userId: z.string(),
      name: z.string(),
      email: z.string()
    })
    .optional()
});

app.patch(
  '/api/v1/incidents/:id',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN', 'ENGINEER']),
  (req: AuthenticatedUserRequest, res) => {
    const parsed = UpdateIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid incident update payload' });
    }

    const updated = store.updateIncident(
      req.params.id,
      req.orgId!,
      parsed.data,
      { id: req.user!.id, name: req.user!.name }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.json({ incident: updated });
  }
);

app.get('/api/v1/incidents/:id/timeline', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const timeline = store.getIncidentTimeline(req.params.id, req.orgId!);
  res.json({ timeline });
});

app.get('/api/v1/incidents/:id/notes', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const notes = store.getIncidentNotes(req.params.id, req.orgId!);
  res.json({ notes });
});

const AddNoteSchema = z.object({
  content: z.string().min(1, 'Note content cannot be empty').max(3000)
});

app.post(
  '/api/v1/incidents/:id/notes',
  requireUserAuth,
  requireOrgMembership,
  requireRole(['OWNER', 'ADMIN', 'ENGINEER']),
  (req: AuthenticatedUserRequest, res) => {
    const parsed = AddNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid note content' });
    }

    const note = store.addIncidentNote(
      req.params.id,
      req.orgId!,
      { id: req.user!.id, name: req.user!.name, email: req.user!.email },
      parsed.data.content
    );

    if (!note) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.status(201).json({ note });
  }
);

// --- Overview Dashboard Metrics ---
app.get('/api/v1/overview', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
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
app.post('/api/v1/dev/simulate-scenario', requireUserAuth, requireOrgMembership, (req: AuthenticatedUserRequest, res) => {
  const { clusterId, scenario } = req.body;
  if (!clusterId || !scenario) {
    return res.status(400).json({ error: 'clusterId and scenario are required' });
  }

  const result = store.simulateScenario(req.orgId!, clusterId, scenario);
  res.json(result);
});

// --- API 404 Handler ---
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
