import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AgentStatus,
  Cluster,
  ClusterStatus,
  Incident,
  IncidentNote,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  KubernetesResource,
  Organization,
  OrgMember,
  OverviewMetrics,
  Role,
  TimelineEvent,
  User
} from '../src/types/index';
import { AGENT_VERSION } from '../src/config/version';
import { IncidentDetector } from './engine/detector';
import { generateIncidentFingerprint } from './engine/fingerprint';

class DataStore {
  private users: Map<string, User> = new Map();
  private orgs: Map<string, Organization> = new Map();
  private members: Map<string, OrgMember[]> = new Map(); // orgId -> members
  private clusters: Map<string, Cluster> = new Map(); // clusterId -> cluster
  private clusterTokens: Map<string, { clusterId: string; orgId: string }> = new Map(); // tokenHash -> info
  private resources: Map<string, KubernetesResource[]> = new Map(); // clusterId -> resources
  private incidents: Map<string, Incident> = new Map(); // incidentId -> incident
  private incidentTimeline: Map<string, TimelineEvent[]> = new Map(); // incidentId -> events
  private incidentNotes: Map<string, IncidentNote[]> = new Map(); // incidentId -> notes
  private incidentCounter = 1001;
  private storagePath = path.join(process.cwd(), 'data', 'skyops_store.json');
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.loadSnapshot();
    if (this.orgs.size === 0 && process.env.NODE_ENV !== 'production') {
      this.seedDevFixtures();
    }
    this.startHeartbeatMonitor();
  }

  private loadSnapshot() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.users) this.users = new Map(Object.entries(data.users));
        if (data.orgs) this.orgs = new Map(Object.entries(data.orgs));
        if (data.members) this.members = new Map(Object.entries(data.members));
        if (data.clusters) this.clusters = new Map(Object.entries(data.clusters));
        if (data.clusterTokens) this.clusterTokens = new Map(Object.entries(data.clusterTokens));
        if (data.resources) this.resources = new Map(Object.entries(data.resources));
        if (data.incidents) this.incidents = new Map(Object.entries(data.incidents));
        if (data.incidentTimeline) this.incidentTimeline = new Map(Object.entries(data.incidentTimeline));
        if (data.incidentNotes) this.incidentNotes = new Map(Object.entries(data.incidentNotes));
        if (data.incidentCounter) this.incidentCounter = data.incidentCounter;
      }
    } catch (err) {
      console.warn('[DataStore] Notice: Unable to load store snapshot, starting clean:', err);
    }
  }

  public saveSnapshot() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const data = {
          users: Object.fromEntries(this.users),
          orgs: Object.fromEntries(this.orgs),
          members: Object.fromEntries(this.members),
          clusters: Object.fromEntries(this.clusters),
          clusterTokens: Object.fromEntries(this.clusterTokens),
          resources: Object.fromEntries(this.resources),
          incidents: Object.fromEntries(this.incidents),
          incidentTimeline: Object.fromEntries(this.incidentTimeline),
          incidentNotes: Object.fromEntries(this.incidentNotes),
          incidentCounter: this.incidentCounter
        };
        fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
      } catch (err) {
        console.warn('[DataStore] Snapshot save notice:', err);
      }
    }, 100);
  }

  /**
   * Seed optional non-production developer fixtures if running locally
   */
  private seedDevFixtures() {
    // Only in explicit development mode
    if (process.env.NODE_ENV === 'production') return;

    const devOrgId = 'org-production-sre';
    const devOrg: Organization = {
      id: devOrgId,
      name: 'Acme Platform Engineering',
      slug: 'acme-platform',
      createdAt: Date.now() - 30 * 86400000,
      membersCount: 3
    };
    this.orgs.set(devOrgId, devOrg);
    this.saveSnapshot();
  }

  // --- Heartbeat & Connection Monitoring ---
  private startHeartbeatMonitor() {
    setInterval(() => {
      const now = Date.now();
      for (const cluster of this.clusters.values()) {
        // If the cluster is in initial pending or awaiting confirmation, do not mark it offline
        if (cluster.connectionState === 'pending' || cluster.connectionState === 'agent_detected') {
          continue;
        }

        if (!cluster.lastHeartbeat) {
          cluster.agentStatus = 'OFFLINE';
          cluster.status = 'AGENT_OFFLINE';
          continue;
        }

        const elapsedSeconds = (now - cluster.lastHeartbeat) / 1000;
        if (elapsedSeconds > 180) {
          // Grace period: mark offline after 3 minutes without heartbeat
          cluster.agentStatus = 'OFFLINE';
          cluster.status = 'AGENT_OFFLINE';
          cluster.connectionState = 'offline';
        } else if (elapsedSeconds > 90) {
          cluster.agentStatus = 'DEGRADED';
          if (cluster.status === 'HEALTHY') cluster.status = 'WARNING';
        } else {
          cluster.agentStatus = 'CONNECTED';
          cluster.connectionState = 'connected';
          // Re-evaluate health based on incidents
          const openIncidents = Array.from(this.incidents.values()).filter(
            (i) => i.clusterId === cluster.id && (i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
          );
          const hasCritical = openIncidents.some((i) => i.severity === 'CRITICAL');
          const hasWarning = openIncidents.some((i) => i.severity === 'HIGH' || i.severity === 'MEDIUM');

          if (hasCritical) cluster.status = 'CRITICAL';
          else if (hasWarning) cluster.status = 'WARNING';
          else cluster.status = 'HEALTHY';
        }
      }
    }, 15000);
  }

  // --- Auth & User / Organization Management ---
  public upsertUser(userData: { id: string; email: string; name: string }): User {
    const existing = this.users.get(userData.id);
    if (existing) {
      existing.email = userData.email;
      existing.name = userData.name;
      this.saveSnapshot();
      return existing;
    }

    const newUser: User = {
      id: userData.id,
      email: userData.email,
      name: userData.name
    };
    this.users.set(newUser.id, newUser);
    this.saveSnapshot();
    return newUser;
  }

  public getUser(userId: string): User | null {
    return this.users.get(userId) || null;
  }

  public getOrganizationsForUser(userId: string): Organization[] {
    const userOrgs: Organization[] = [];
    for (const [orgId, members] of this.members.entries()) {
      if (members.some((m) => m.userId === userId)) {
        const org = this.orgs.get(orgId);
        if (org) userOrgs.push(org);
      }
    }
    return userOrgs;
  }

  public createOrganization(name: string, ownerUserId: string): Organization {
    const orgId = `org-${crypto.randomBytes(6).toString('hex')}`;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30);

    const org: Organization = {
      id: orgId,
      name,
      slug,
      createdAt: Date.now(),
      membersCount: 1
    };
    this.orgs.set(orgId, org);

    const user = this.users.get(ownerUserId);
    this.members.set(orgId, [
      {
        userId: ownerUserId,
        email: user?.email || '',
        name: user?.name || 'Workspace Owner',
        role: 'OWNER',
        joinedAt: Date.now()
      }
    ]);

    this.saveSnapshot();
    return org;
  }

  public getOrgMembers(orgId: string): OrgMember[] {
    return this.members.get(orgId) || [];
  }

  public checkUserOrgAccess(userId: string, orgId: string): { hasAccess: boolean; role?: Role } {
    const orgMembers = this.members.get(orgId) || [];
    const member = orgMembers.find((m) => m.userId === userId);
    if (!member) return { hasAccess: false };
    return { hasAccess: true, role: member.role };
  }

  // --- Cluster Management ---
  public getClusters(orgId: string): Cluster[] {
    return Array.from(this.clusters.values())
      .filter((c) => c.orgId === orgId)
      .map((c) => {
        // Do not expose raw agentToken in generic cluster list
        const { agentToken, ...sanitized } = c;
        return sanitized as Cluster;
      });
  }

  public getCluster(clusterId: string, orgId: string, includeToken = false): Cluster | null {
    const cluster = this.clusters.get(clusterId);
    if (!cluster || cluster.orgId !== orgId) return null;
    if (includeToken) return cluster;
    const { agentToken, ...sanitized } = cluster;
    return sanitized as Cluster;
  }

  public getClusterByIdInternal(clusterId: string): Cluster | null {
    return this.clusters.get(clusterId) || null;
  }

  /**
   * Generates a cryptographically random, human-friendly connection key e.g. SKYOPS-7K4M-92PX
   */
  private generatePairingCode(): string {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Base32 unambiguous charset (no 0, 1, I, O)
    const bytes = crypto.randomBytes(8);
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) {
      part1 += alphabet[bytes[i] % alphabet.length];
      part2 += alphabet[bytes[i + 4] % alphabet.length];
    }
    return `SKYOPS-${part1}-${part2}`;
  }

  public getClusterByInstallKey(installKey: string): Cluster | null {
    if (!installKey) return null;
    for (const cluster of this.clusters.values()) {
      if (cluster.installKey === installKey) {
        return cluster;
      }
    }
    return null;
  }

  public createCluster(
    orgId: string,
    name: string,
    description?: string
  ): { cluster: Cluster; rawToken: string; connectionCode: string; installKey: string } {
    const clusterId = `cls-${crypto.randomBytes(6).toString('hex')}`;
    const rawToken = `sky_agent_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Generate single-use, 15-minute connection pairing key (e.g. 8F4K-29XM)
    const connectionCode = this.generatePairingCode();
    const connectionCodeExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity

    // Generate separate short-lived installation session for secure automated download
    const installKey = `sky_inst_${crypto.randomBytes(20).toString('hex')}`;
    const installKeyExpiresAt = Date.now() + 60 * 60 * 1000; // 60 minutes validity

    const cluster: Cluster = {
      id: clusterId,
      orgId,
      name,
      description: description || '',
      status: 'pending',
      agentStatus: 'PENDING',
      connectionState: 'pending',
      connectionCode,
      connectionCodeExpiresAt,
      installKey,
      installKeyExpiresAt,
      nodeCount: 0,
      podCount: 0,
      openIncidentCount: 0,
      createdAt: Date.now(),
      agentToken: rawToken
    };

    this.clusters.set(clusterId, cluster);
    this.clusterTokens.set(tokenHash, { clusterId, orgId });
    this.resources.set(clusterId, []);
    this.saveSnapshot();

    return { cluster, rawToken, connectionCode, installKey };
  }

  public verifyClusterConnection(clusterId: string, orgId: string, providedCode: string): Cluster {
    const cluster = this.clusters.get(clusterId);
    if (!cluster || cluster.orgId !== orgId) {
      throw new Error('Cluster not found in active organization');
    }

    if (cluster.connectionState === 'connected' && cluster.agentStatus === 'CONNECTED') {
      return cluster;
    }

    if (!cluster.connectionCode) {
      throw new Error('This connection key has already been consumed or is invalid. Generate a new connection key.');
    }

    if (cluster.connectionCodeExpiresAt && Date.now() > cluster.connectionCodeExpiresAt) {
      throw new Error('This connection key has expired. Generate a new connection key.');
    }

    // Strip whitespace, hyphens, and optional SKYOPS- prefix
    const cleanProvided = providedCode.trim().toUpperCase().replace(/^SKYOPS-?/, '').replace(/[\s-]+/g, '');
    const cleanStored = cluster.connectionCode.trim().toUpperCase().replace(/^SKYOPS-?/, '').replace(/[\s-]+/g, '');

    if (cleanProvided !== cleanStored) {
      throw new Error('That connection key is incorrect.');
    }

    // Success: Activate connection and permanently invalidate the single-use pairing code and installKey
    cluster.status = 'HEALTHY';
    cluster.agentStatus = 'CONNECTED';
    cluster.connectionState = 'connected';
    cluster.connectedAt = Date.now();
    cluster.lastHeartbeat = cluster.lastHeartbeat || Date.now();
    cluster.lastHeartbeatAt = cluster.lastHeartbeatAt || Date.now();
    cluster.connectionCode = undefined;
    cluster.connectionCodeExpiresAt = undefined;
    cluster.installKey = undefined;
    cluster.installKeyExpiresAt = undefined;
    this.saveSnapshot();

    return cluster;
  }

  public regenerateClusterCredentials(
    clusterId: string,
    orgId: string
  ): { cluster: Cluster; rawToken: string; connectionCode: string; installKey: string } {
    const cluster = this.clusters.get(clusterId);
    if (!cluster || cluster.orgId !== orgId) {
      throw new Error('Cluster not found in active organization');
    }

    // Invalidate existing tokens for this cluster
    for (const [hash, info] of this.clusterTokens.entries()) {
      if (info.clusterId === clusterId) {
        this.clusterTokens.delete(hash);
      }
    }

    // Generate new credentials
    const rawToken = `sky_agent_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const connectionCode = this.generatePairingCode();
    const connectionCodeExpiresAt = Date.now() + 15 * 60 * 1000;

    const installKey = `sky_inst_${crypto.randomBytes(20).toString('hex')}`;
    const installKeyExpiresAt = Date.now() + 60 * 60 * 1000;

    cluster.agentToken = rawToken;
    cluster.connectionCode = connectionCode;
    cluster.connectionCodeExpiresAt = connectionCodeExpiresAt;
    cluster.installKey = installKey;
    cluster.installKeyExpiresAt = installKeyExpiresAt;
    cluster.status = 'pending';
    cluster.agentStatus = 'PENDING';
    cluster.connectionState = 'pending';
    cluster.agentDetectedAt = undefined;

    this.clusterTokens.set(tokenHash, { clusterId, orgId });
    this.saveSnapshot();

    return { cluster, rawToken, connectionCode, installKey };
  }

  public disconnectCluster(clusterId: string, orgId: string): boolean {
    const cluster = this.clusters.get(clusterId);
    if (!cluster || cluster.orgId !== orgId) return false;

    // Revoke token hash to reject future agent requests
    for (const [hash, info] of this.clusterTokens.entries()) {
      if (info.clusterId === clusterId) {
        this.clusterTokens.delete(hash);
      }
    }

    cluster.agentToken = undefined;
    cluster.status = 'AGENT_OFFLINE';
    cluster.agentStatus = 'OFFLINE';
    cluster.connectionState = 'offline';
    this.saveSnapshot();
    return true;
  }

  public deleteCluster(clusterId: string, orgId: string): boolean {
    const cluster = this.clusters.get(clusterId);
    if (!cluster || cluster.orgId !== orgId) return false;

    // Delete token hash
    for (const [hash, info] of this.clusterTokens.entries()) {
      if (info.clusterId === clusterId) {
        this.clusterTokens.delete(hash);
      }
    }

    this.clusters.delete(clusterId);
    this.resources.delete(clusterId);

    // Delete associated incidents
    for (const [incId, inc] of this.incidents.entries()) {
      if (inc.clusterId === clusterId) {
        this.incidents.delete(incId);
        this.incidentTimeline.delete(incId);
        this.incidentNotes.delete(incId);
      }
    }

    this.saveSnapshot();
    return true;
  }

  // --- Agent Authentication & Ingestion ---
  public authenticateAgentToken(rawToken: string): { clusterId: string; orgId: string } | null {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const entry = this.clusterTokens.get(tokenHash);
    return entry || null;
  }

  public registerAgent(
    clusterId: string,
    agentVersion?: string,
    k8sVersion?: string
  ): { status: string; clusterId: string; connectionCode?: string; serverTime: number } {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      throw new Error('Cluster not found for this agent token');
    }

    const now = Date.now();
    cluster.lastSeenAt = now;
    cluster.lastHeartbeat = now;
    cluster.lastHeartbeatAt = now;
    cluster.agentDetectedAt = cluster.agentDetectedAt || now;
    cluster.connectedAt = cluster.connectedAt || now;
    if (agentVersion) cluster.agentVersion = agentVersion;
    if (k8sVersion) cluster.k8sVersion = k8sVersion;

    cluster.agentStatus = 'CONNECTED';
    cluster.connectionState = 'connected';
    cluster.connectionStatus = 'connected';
    if (cluster.status === 'pending' || cluster.status === 'installing' || cluster.status === 'agent_detected') {
      cluster.status = 'HEALTHY';
    }

    return {
      status: 'REGISTERED',
      clusterId,
      connectionCode: cluster.connectionCode,
      serverTime: now
    };
  }

  public recordAgentHeartbeat(
    clusterId: string,
    agentVersion?: string,
    k8sVersion?: string,
    nodeCount?: number,
    podCount?: number
  ): boolean {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return false;

    const now = Date.now();
    cluster.lastHeartbeat = now;
    cluster.lastHeartbeatAt = now;
    cluster.lastSeenAt = now;
    cluster.connectedAt = cluster.connectedAt || now;
    if (agentVersion && agentVersion.trim() !== '') {
      cluster.agentVersion = agentVersion;
    }

    // Preserve real live Kubernetes version; reject outdated dummy fallback v1.31.2 if real version exists
    if (k8sVersion && k8sVersion.trim() !== '' && k8sVersion !== 'v1.31.2') {
      cluster.k8sVersion = k8sVersion;
    } else if (k8sVersion && !cluster.k8sVersion) {
      cluster.k8sVersion = k8sVersion;
    }

    const existingResources = this.resources.get(clusterId) || [];
    const calculatedNodes = existingResources.filter((r) => r.kind === 'Node').length;
    const calculatedPods = existingResources.filter((r) => r.kind === 'Pod').length;

    if (typeof nodeCount === 'number' && nodeCount > 0) {
      cluster.nodeCount = nodeCount;
    } else if (calculatedNodes > 0 || cluster.nodeCount === undefined) {
      cluster.nodeCount = calculatedNodes;
    }

    if (typeof podCount === 'number' && podCount > 0) {
      cluster.podCount = podCount;
    } else if (calculatedPods > 0 || cluster.podCount === undefined) {
      cluster.podCount = calculatedPods;
    }

    // Derive K8s version from Node resources if cluster version is still missing or outdated
    if ((!cluster.k8sVersion || cluster.k8sVersion === 'v1.31.2') && calculatedNodes > 0) {
      const firstNode = existingResources.find((r) => r.kind === 'Node');
      const kubeletVer = (firstNode?.statusSummary?.kubeletVersion as string) || (firstNode?.specSummary?.kubeletVersion as string);
      if (kubeletVer) {
        cluster.k8sVersion = kubeletVer;
      }
    }

    cluster.agentStatus = 'CONNECTED';
    cluster.connectionState = 'connected';
    cluster.connectionStatus = 'connected';

    // Refresh cluster health status based on open incidents
    const openIncidents = Array.from(this.incidents.values()).filter(
      (i) => i.clusterId === clusterId && (i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
    );
    const hasCritical = openIncidents.some((i) => i.severity === 'CRITICAL');
    const hasWarning = openIncidents.some((i) => i.severity === 'HIGH' || i.severity === 'MEDIUM');

    if (hasCritical) cluster.status = 'CRITICAL';
    else if (hasWarning) cluster.status = 'WARNING';
    else cluster.status = 'HEALTHY';

    cluster.openIncidentCount = openIncidents.length;

    return true;
  }

  public syncClusterResources(clusterId: string, incomingResources: KubernetesResource[], snapshotComplete = false): void {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;

    this.resources.set(clusterId, incomingResources);

    // Update counts
    const nodes = incomingResources.filter((r) => r.kind === 'Node');
    const pods = incomingResources.filter((r) => r.kind === 'Pod');
    cluster.nodeCount = nodes.length;
    cluster.podCount = pods.length;

    // Detect K8s Version from Node telemetry if present
    if (nodes.length > 0) {
      const firstNode = nodes[0];
      const kubeletVer = (firstNode.statusSummary?.kubeletVersion as string) || (firstNode.specSummary?.kubeletVersion as string);
      if (kubeletVer) {
        cluster.k8sVersion = kubeletVer;
      }
    }

    // Run deterministic incident detection & auto-recovery on each resource
    for (const res of incomingResources) {
      this.evaluateResourceObservation(cluster.orgId, clusterId, cluster.name, res);
    }

    // Auto-clean any false positive Deployment/DaemonSet/Pod incidents where the resource is currently healthy
    for (const inc of this.incidents.values()) {
      if (inc.clusterId === clusterId && (inc.status === 'OPEN' || inc.status === 'IN_PROGRESS' || inc.status === 'ACKNOWLEDGED')) {
        const matchingResource = incomingResources.find(
          (r) =>
            r.kind.toLowerCase() === inc.resourceKind.toLowerCase() &&
            (r.namespace || 'default').toLowerCase() === inc.namespace.toLowerCase() &&
            r.name.toLowerCase() === inc.resourceName.toLowerCase()
        );

        if (matchingResource) {
          const recovery = IncidentDetector.evaluateRecovery(matchingResource, inc.incidentType);
          if (recovery.recovered) {
            inc.status = 'RESOLVED';
            inc.resolvedAt = Date.now();
            inc.updatedAt = Date.now();
            this.addTimelineEvent(inc.id, {
              type: 'RECOVERY',
              actor: { type: 'AGENT', name: 'SkyOps Telemetry Engine' },
              description: `Auto-resolved: ${recovery.reason}`
            });
          }
        } else if (snapshotComplete) {
          // A resource absent from an explicitly complete snapshot was deleted.
          // Never infer deletion from a partial/failed scrape.
          inc.status = 'RESOLVED';
          inc.resolvedAt = Date.now();
          inc.updatedAt = Date.now();
          this.addTimelineEvent(inc.id, {
            type: 'RECOVERY', actor: { type: 'AGENT', name: 'SkyOps Telemetry Engine' },
            description: 'Auto-resolved: resource no longer exists in a complete Kubernetes snapshot'
          });
        }
      }
    }

    this.updateClusterIncidentCount(clusterId);
    this.saveSnapshot();
  }

  public deleteIncident(incidentId: string, orgId: string): boolean {
    const inc = this.incidents.get(incidentId);
    if (!inc || inc.orgId !== orgId) return false;

    this.incidents.delete(incidentId);
    this.incidentTimeline.delete(incidentId);
    this.incidentNotes.delete(incidentId);
    this.updateClusterIncidentCount(inc.clusterId);
    this.saveSnapshot();
    return true;
  }

  public clearAllIncidents(orgId: string): number {
    let count = 0;
    for (const [id, inc] of Array.from(this.incidents.entries())) {
      if (inc.orgId === orgId) {
        this.incidents.delete(id);
        this.incidentTimeline.delete(id);
        this.incidentNotes.delete(id);
        count++;
      }
    }
    for (const cluster of this.clusters.values()) {
      if (cluster.orgId === orgId) {
        this.updateClusterIncidentCount(cluster.id);
      }
    }
    this.saveSnapshot();
    return count;
  }

  public getClusterResources(clusterId: string, orgId: string): KubernetesResource[] {
    const cluster = this.getCluster(clusterId, orgId);
    if (!cluster) return [];
    return this.resources.get(clusterId) || [];
  }

  // --- Deterministic Incident Engine & Deduplication ---
  public evaluateResourceObservation(
    orgId: string,
    clusterId: string,
    clusterName: string,
    resource: KubernetesResource
  ): Incident | null {
    // 1. Evaluate Detection Rules
    const detection = IncidentDetector.evaluateResource(resource);

    if (detection && detection.detected) {
      const fingerprint = generateIncidentFingerprint(
        clusterId,
        resource.namespace || 'default',
        resource.kind,
        resource.name,
        detection.incidentType
      );

      // Deduplication: Look for existing active incident with same fingerprint
      const existingIncident = Array.from(this.incidents.values()).find(
        (inc) =>
          inc.fingerprint === fingerprint &&
          (inc.status === 'OPEN' || inc.status === 'ACKNOWLEDGED' || inc.status === 'IN_PROGRESS')
      );

      if (existingIncident) {
        // Increment occurrence, update technical details
        existingIncident.occurrenceCount += 1;
        existingIncident.lastSeenAt = Date.now();
        existingIncident.updatedAt = Date.now();
        existingIncident.technicalDetails = {
          ...existingIncident.technicalDetails,
          ...detection.technicalDetails
        };

        // Preserve the occurrence count on every pulse, but bound timeline noise
        // to one repeat entry per five minutes.
        const lastOccurrence = (this.incidentTimeline.get(existingIncident.id) || []).filter(event => event.type === 'OCCURRENCE').at(-1);
        if (!lastOccurrence || Date.now() - lastOccurrence.timestamp >= 5 * 60 * 1000) {
          this.addTimelineEvent(existingIncident.id, {
            type: 'OCCURRENCE', actor: { type: 'AGENT', name: 'SkyOps Agent' },
            description: `Observed repeat failure condition #${existingIncident.occurrenceCount} for ${resource.kind} ${resource.name}`,
            metadata: { occurrenceCount: existingIncident.occurrenceCount }
          });
        }

        return existingIncident;
      }

      // Check if there was a recently resolved incident (within 10 minutes) to reopen or create new
      const recentResolved = Array.from(this.incidents.values()).find(
        (inc) =>
          inc.fingerprint === fingerprint &&
          inc.status === 'RESOLVED' &&
          inc.resolvedAt &&
          Date.now() - inc.resolvedAt < 10 * 60 * 1000
      );

      if (recentResolved) {
        recentResolved.status = 'OPEN';
        recentResolved.occurrenceCount += 1;
        recentResolved.lastSeenAt = Date.now();
        recentResolved.resolvedAt = null;
        recentResolved.updatedAt = Date.now();
        recentResolved.technicalDetails = {
          ...recentResolved.technicalDetails,
          ...detection.technicalDetails
        };

        this.addTimelineEvent(recentResolved.id, {
          type: 'STATE_CHANGE',
          actor: { type: 'AGENT', name: 'SkyOps Agent' },
          description: `Incident reopened: failure condition detected again on ${resource.kind} ${resource.name}`
        });

        this.updateClusterIncidentCount(clusterId);
        return recentResolved;
      }

      // Create brand-new Incident with atomic SKY-XXXX sequence
      const nextNum = this.incidentCounter++;
      const incidentId = `SKY-${String(nextNum).padStart(4, '0')}`;

      const newIncident: Incident = {
        id: incidentId,
        fingerprint,
        orgId,
        clusterId,
        clusterName,
        namespace: resource.namespace || 'default',
        resourceKind: resource.kind,
        resourceName: resource.name,
        incidentType: detection.incidentType,
        title: detection.title,
        severity: detection.severity,
        status: 'OPEN',
        occurrenceCount: 1,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        technicalDetails: detection.technicalDetails,
        updatedAt: Date.now()
      };

      this.incidents.set(incidentId, newIncident);
      this.incidentTimeline.set(incidentId, []);
      this.incidentNotes.set(incidentId, []);

      // Timeline entry: DETECTION
      this.addTimelineEvent(incidentId, {
        type: 'DETECTION',
        actor: { type: 'SYSTEM', name: 'SkyOps Engine' },
        description: `Incident created: ${detection.title}`
      });

      this.updateClusterIncidentCount(clusterId);
      return newIncident;
    }

    // 2. Evaluate Auto-Recovery for any active incidents regarding this resource
    const activeIncidentsForResource = Array.from(this.incidents.values()).filter(
      (inc) =>
        inc.clusterId === clusterId &&
        inc.namespace.toLowerCase() === (resource.namespace || 'default').toLowerCase() &&
        inc.resourceKind.toLowerCase() === resource.kind.toLowerCase() &&
        inc.resourceName.toLowerCase() === resource.name.toLowerCase() &&
        (inc.status === 'OPEN' || inc.status === 'ACKNOWLEDGED' || inc.status === 'IN_PROGRESS')
    );

    for (const activeInc of activeIncidentsForResource) {
      const recovery = IncidentDetector.evaluateRecovery(resource, activeInc.incidentType);
      if (recovery.recovered) {
        activeInc.status = 'RESOLVED';
        activeInc.resolvedAt = Date.now();
        activeInc.updatedAt = Date.now();

        this.addTimelineEvent(activeInc.id, {
          type: 'RECOVERY',
          actor: { type: 'AGENT', name: 'SkyOps Agent' },
          description: `Automatic recovery detected: ${recovery.reason}`
        });

        this.updateClusterIncidentCount(clusterId);
      }
    }

    return null;
  }

  private updateClusterIncidentCount(clusterId: string) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;

    const openCount = Array.from(this.incidents.values()).filter(
      (i) => i.clusterId === clusterId && (i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
    ).length;

    cluster.openIncidentCount = openCount;

    if (cluster.agentStatus === 'CONNECTED') {
      const hasCritical = Array.from(this.incidents.values()).some(
        (i) => i.clusterId === clusterId && i.severity === 'CRITICAL' && i.status !== 'RESOLVED' && i.status !== 'CLOSED'
      );
      const hasWarning = Array.from(this.incidents.values()).some(
        (i) => i.clusterId === clusterId && (i.severity === 'HIGH' || i.severity === 'MEDIUM') && i.status !== 'RESOLVED' && i.status !== 'CLOSED'
      );

      if (hasCritical) cluster.status = 'CRITICAL';
      else if (hasWarning) cluster.status = 'WARNING';
      else cluster.status = 'HEALTHY';
    }
  }

  // --- Incident Queries & Mutations ---
  public getIncidents(
    orgId: string,
    filters?: {
      status?: IncidentStatus;
      severity?: IncidentSeverity;
      clusterId?: string;
      namespace?: string;
      search?: string;
    }
  ): Incident[] {
    let list = Array.from(this.incidents.values()).filter((i) => i.orgId === orgId);

    if (filters?.status) list = list.filter((i) => i.status === filters.status);
    if (filters?.severity) list = list.filter((i) => i.severity === filters.severity);
    if (filters?.clusterId) list = list.filter((i) => i.clusterId === filters.clusterId);
    if (filters?.namespace) list = list.filter((i) => i.namespace.toLowerCase() === filters.namespace?.toLowerCase());
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.resourceName.toLowerCase().includes(q) ||
          i.namespace.toLowerCase().includes(q) ||
          i.clusterName.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  public getIncident(incidentId: string, orgId: string): Incident | null {
    const inc = this.incidents.get(incidentId);
    if (!inc || inc.orgId !== orgId) return null;
    return inc;
  }

  public updateIncident(
    incidentId: string,
    orgId: string,
    updates: {
      status?: IncidentStatus;
      severity?: IncidentSeverity;
      title?: string;
      assignee?: { userId: string; name: string; email: string };
    },
    userActor: { id: string; name: string }
  ): Incident | null {
    const inc = this.getIncident(incidentId, orgId);
    if (!inc) return null;

    if (updates.status && updates.status !== inc.status) {
      const oldStatus = inc.status;
      inc.status = updates.status;
      if (updates.status === 'RESOLVED' && !inc.resolvedAt) {
        inc.resolvedAt = Date.now();
      } else if (updates.status !== 'RESOLVED' && updates.status !== 'CLOSED') {
        inc.resolvedAt = null;
      }
      this.addTimelineEvent(incidentId, {
        type: 'STATE_CHANGE',
        actor: { type: 'USER', id: userActor.id, name: userActor.name },
        description: `Status changed from ${oldStatus} to ${updates.status}`
      });
      this.updateClusterIncidentCount(inc.clusterId);
    }

    if (updates.severity && updates.severity !== inc.severity) {
      const oldSeverity = inc.severity;
      inc.severity = updates.severity;
      this.addTimelineEvent(incidentId, {
        type: 'SEVERITY_CHANGE',
        actor: { type: 'USER', id: userActor.id, name: userActor.name },
        description: `Severity adjusted from ${oldSeverity} to ${updates.severity}`
      });
      this.updateClusterIncidentCount(inc.clusterId);
    }

    if (updates.title && updates.title !== inc.title) {
      inc.title = updates.title;
      this.addTimelineEvent(incidentId, {
        type: 'MANUAL_UPDATE',
        actor: { type: 'USER', id: userActor.id, name: userActor.name },
        description: `Title updated to: ${updates.title}`
      });
    }

    if (updates.assignee) {
      inc.assignee = updates.assignee;
      this.addTimelineEvent(incidentId, {
        type: 'ASSIGNMENT',
        actor: { type: 'USER', id: userActor.id, name: userActor.name },
        description: `Assigned investigation to ${updates.assignee.name} (${updates.assignee.email})`
      });
    }

    inc.updatedAt = Date.now();
    return inc;
  }

  public getIncidentTimeline(incidentId: string, orgId: string): TimelineEvent[] {
    const inc = this.getIncident(incidentId, orgId);
    if (!inc) return [];
    return (this.incidentTimeline.get(incidentId) || []).slice().sort((a, b) => a.timestamp - b.timestamp);
  }

  public addTimelineEvent(incidentId: string, event: Omit<TimelineEvent, 'id' | 'incidentId' | 'timestamp'>): TimelineEvent {
    const newEvent: TimelineEvent = {
      id: `evt-${crypto.randomBytes(6).toString('hex')}`,
      incidentId,
      timestamp: Date.now(),
      ...event
    };
    const list = this.incidentTimeline.get(incidentId) || [];
    list.push(newEvent);
    this.incidentTimeline.set(incidentId, list);
    return newEvent;
  }

  public getIncidentNotes(incidentId: string, orgId: string): IncidentNote[] {
    const inc = this.getIncident(incidentId, orgId);
    if (!inc) return [];
    return (this.incidentNotes.get(incidentId) || []).slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  public addIncidentNote(
    incidentId: string,
    orgId: string,
    author: { id: string; name: string; email: string },
    content: string
  ): IncidentNote | null {
    const inc = this.getIncident(incidentId, orgId);
    if (!inc) return null;

    const note: IncidentNote = {
      id: `note-${crypto.randomBytes(6).toString('hex')}`,
      incidentId,
      authorId: author.id,
      authorName: author.name,
      authorEmail: author.email,
      content: content.trim(),
      createdAt: Date.now()
    };

    const list = this.incidentNotes.get(incidentId) || [];
    list.push(note);
    this.incidentNotes.set(incidentId, list);

    this.addTimelineEvent(incidentId, {
      type: 'NOTE_ADDED',
      actor: { type: 'USER', id: author.id, name: author.name },
      description: `Added investigation note (${content.slice(0, 60)}${content.length > 60 ? '...' : ''})`
    });

    inc.updatedAt = Date.now();
    return note;
  }

  // --- Overview Metrics ---
  public getOverviewMetrics(orgId: string): OverviewMetrics {
    const clusters = this.getClusters(orgId);
    const incidents = Array.from(this.incidents.values()).filter((i) => i.orgId === orgId);

    const openIncidents = incidents.filter(
      (i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED'
    );

    const todayStart = new Date().setHours(0, 0, 0, 0);
    const resolvedToday = incidents.filter((i) => i.status === 'RESOLVED' && i.resolvedAt && i.resolvedAt >= todayStart);

    return {
      totalClusters: clusters.length,
      healthyClusters: clusters.filter((c) => c.status === 'HEALTHY').length,
      warningClusters: clusters.filter((c) => c.status === 'WARNING').length,
      criticalClusters: clusters.filter((c) => c.status === 'CRITICAL').length,
      offlineClusters: clusters.filter((c) => c.status === 'AGENT_OFFLINE').length,
      openIncidents: openIncidents.length,
      criticalIncidents: openIncidents.filter((i) => i.severity === 'CRITICAL').length,
      highIncidents: openIncidents.filter((i) => i.severity === 'HIGH').length,
      mediumIncidents: openIncidents.filter((i) => i.severity === 'MEDIUM').length,
      lowIncidents: openIncidents.filter((i) => i.severity === 'LOW' || i.severity === 'INFO').length,
      resolvedTodayCount: resolvedToday.length
    };
  }

  public getRecentActivity(orgId: string, limit = 15): Array<{
    id: string;
    type: string;
    timestamp: number;
    title: string;
    description: string;
    incidentId?: string;
    clusterId?: string;
  }> {
    const activity: Array<{
      id: string;
      type: string;
      timestamp: number;
      title: string;
      description: string;
      incidentId?: string;
      clusterId?: string;
    }> = [];

    const orgIncidents = Array.from(this.incidents.values()).filter((i) => i.orgId === orgId);

    for (const inc of orgIncidents) {
      const timeline = this.incidentTimeline.get(inc.id) || [];
      for (const evt of timeline) {
        activity.push({
          id: evt.id,
          type: evt.type,
          timestamp: evt.timestamp,
          title: `${inc.id}: ${evt.type}`,
          description: evt.description,
          incidentId: inc.id,
          clusterId: inc.clusterId
        });
      }
    }

    return activity.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  // --- Development & QA Scenario Simulation ---
  public simulateScenario(
    orgId: string,
    clusterId: string,
    scenario:
      | 'CrashLoopBackOff'
      | 'ImagePullBackOff'
      | 'OOMKilled'
      | 'NodeNotReady'
      | 'DeploymentDegraded'
      | 'PVCPending'
      | 'RecoverAll'
  ): { success: boolean; message: string; incidentId?: string } {
    const cluster = this.getCluster(clusterId, orgId);
    if (!cluster) return { success: false, message: 'Cluster not found' };

    // Ensure cluster is connected
    this.recordAgentHeartbeat(clusterId, AGENT_VERSION, cluster.k8sVersion || 'v1.35.1', cluster.nodeCount || 2, cluster.podCount || 10);

    let resources = this.resources.get(clusterId) || [];

    if (scenario === 'RecoverAll') {
      // Revert all resources to healthy
      resources = resources.map((r) => {
        if (r.kind === 'Pod') {
          return {
            ...r,
            status: 'Running',
            containers: r.containers?.map((c) => ({
              ...c,
              ready: true,
              state: 'running',
              waitingReason: undefined,
              waitingMessage: undefined,
              restartCount: c.restartCount
            }))
          };
        }
        if (r.kind === 'Node') {
          return {
            ...r,
            conditions: r.conditions?.map((c) =>
              c.type === 'Ready' ? { ...c, status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' } : c
            )
          };
        }
        if (r.kind === 'Deployment') {
          const desired = Number(r.specSummary?.replicas || 3);
          return {
            ...r,
            statusSummary: { availableReplicas: desired, readyReplicas: desired, updatedReplicas: desired }
          };
        }
        if (r.kind === 'PersistentVolumeClaim' || r.kind === 'PVC') {
          return { ...r, status: 'Bound' };
        }
        return r;
      });

      this.syncClusterResources(clusterId, resources);
      return { success: true, message: 'Simulated recovery applied across all cluster resources.' };
    }

    if (scenario === 'CrashLoopBackOff') {
      const podName = 'skyops-api-gateway-7f89d4b6-kx92z';
      const failingPod: KubernetesResource = {
        id: `res-${crypto.randomBytes(4).toString('hex')}`,
        clusterId,
        kind: 'Pod',
        namespace: 'production',
        name: podName,
        status: 'Running',
        health: 'CRITICAL',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        specSummary: { nodeName: 'k8s-node-worker-02', restartPolicy: 'Always' },
        statusSummary: { phase: 'Running', podIP: '10.244.2.89' },
        containers: [
          {
            name: 'api-server',
            image: 'registry.acme.corp/skyops/api:v2.8.1',
            restartCount: 7,
            ready: false,
            state: 'waiting',
            waitingReason: 'CrashLoopBackOff',
            waitingMessage: 'back-off 5m0s restarting failed container=api-server pod=skyops-api-gateway-7f89d4b6-kx92z',
            exitCode: 1
          }
        ],
        conditions: [
          { type: 'Initialized', status: 'True' },
          { type: 'Ready', status: 'False', reason: 'ContainersNotReady' },
          { type: 'ContainersReady', status: 'False', reason: 'ContainersNotReady' },
          { type: 'PodScheduled', status: 'True' }
        ],
        events: [
          {
            id: `evt-${crypto.randomBytes(4).toString('hex')}`,
            timestamp: Date.now() - 120000,
            type: 'Warning',
            reason: 'BackOff',
            objectKind: 'Pod',
            objectName: podName,
            namespace: 'production',
            message: 'Back-off restarting failed container api-server in pod skyops-api-gateway-7f89d4b6-kx92z'
          }
        ]
      };

      const existingIndex = resources.findIndex((r) => r.name === podName && r.namespace === 'production');
      if (existingIndex >= 0) resources[existingIndex] = failingPod;
      else resources.push(failingPod);

      this.syncClusterResources(clusterId, resources);
      const inc = this.evaluateResourceObservation(orgId, clusterId, cluster.name, failingPod);
      return { success: true, message: 'Injected CrashLoopBackOff on Pod skyops-api-gateway', incidentId: inc?.id };
    }

    if (scenario === 'ImagePullBackOff') {
      const podName = 'auth-service-v3-84f9cc964-m7x8q';
      const failingPod: KubernetesResource = {
        id: `res-${crypto.randomBytes(4).toString('hex')}`,
        clusterId,
        kind: 'Pod',
        namespace: 'auth-layer',
        name: podName,
        status: 'Pending',
        health: 'CRITICAL',
        createdAt: Date.now() - 1800000,
        updatedAt: Date.now(),
        specSummary: { nodeName: 'k8s-node-worker-01' },
        statusSummary: { phase: 'Pending', podIP: '10.244.1.45' },
        containers: [
          {
            name: 'auth-daemon',
            image: 'registry.acme.corp/auth/service:v3.9.0-rc.2',
            restartCount: 0,
            ready: false,
            state: 'waiting',
            waitingReason: 'ImagePullBackOff',
            waitingMessage: 'Back-off pulling image "registry.acme.corp/auth/service:v3.9.0-rc.2": ErrImagePull: manifest unknown'
          }
        ],
        conditions: [
          { type: 'Initialized', status: 'True' },
          { type: 'Ready', status: 'False', reason: 'ContainersNotReady' },
          { type: 'ContainersReady', status: 'False', reason: 'ContainersNotReady' }
        ],
        events: [
          {
            id: `evt-${crypto.randomBytes(4).toString('hex')}`,
            timestamp: Date.now() - 60000,
            type: 'Warning',
            reason: 'Failed',
            objectKind: 'Pod',
            objectName: podName,
            namespace: 'auth-layer',
            message: 'Failed to pull image "registry.acme.corp/auth/service:v3.9.0-rc.2": rpc error: code = NotFound desc = failed to pull and unpack image'
          }
        ]
      };

      const existingIndex = resources.findIndex((r) => r.name === podName && r.namespace === 'auth-layer');
      if (existingIndex >= 0) resources[existingIndex] = failingPod;
      else resources.push(failingPod);

      this.syncClusterResources(clusterId, resources);
      const inc = this.evaluateResourceObservation(orgId, clusterId, cluster.name, failingPod);
      return { success: true, message: 'Injected ImagePullBackOff on Pod auth-service-v3', incidentId: inc?.id };
    }

    if (scenario === 'OOMKilled') {
      const podName = 'data-pipeline-worker-5bc674d-90plk';
      const failingPod: KubernetesResource = {
        id: `res-${crypto.randomBytes(4).toString('hex')}`,
        clusterId,
        kind: 'Pod',
        namespace: 'data-processing',
        name: podName,
        status: 'Running',
        health: 'CRITICAL',
        createdAt: Date.now() - 2400000,
        updatedAt: Date.now(),
        specSummary: { nodeName: 'k8s-node-worker-03' },
        statusSummary: { phase: 'Running', podIP: '10.244.3.12' },
        containers: [
          {
            name: 'etl-transformer',
            image: 'registry.acme.corp/pipeline/transformer:v1.14',
            restartCount: 4,
            ready: false,
            state: 'terminated',
            terminationReason: 'OOMKilled',
            exitCode: 137,
            waitingReason: 'CrashLoopBackOff',
            waitingMessage: 'Container etl-transformer was killed by Linux Out-Of-Memory killer (memory limit: 2048Mi exceeded)'
          }
        ],
        conditions: [{ type: 'Ready', status: 'False', reason: 'ContainersNotReady' }],
        events: [
          {
            id: `evt-${crypto.randomBytes(4).toString('hex')}`,
            timestamp: Date.now() - 30000,
            type: 'Warning',
            reason: 'OOMKilled',
            objectKind: 'Pod',
            objectName: podName,
            namespace: 'data-processing',
            message: 'Container etl-transformer in pod data-pipeline-worker-5bc674d-90plk exceeded memory limits and was OOMKilled.'
          }
        ]
      };

      const existingIndex = resources.findIndex((r) => r.name === podName && r.namespace === 'data-processing');
      if (existingIndex >= 0) resources[existingIndex] = failingPod;
      else resources.push(failingPod);

      this.syncClusterResources(clusterId, resources);
      const inc = this.evaluateResourceObservation(orgId, clusterId, cluster.name, failingPod);
      return { success: true, message: 'Injected OOMKilled condition on Pod data-pipeline-worker', incidentId: inc?.id };
    }

    if (scenario === 'NodeNotReady') {
      const nodeName = 'k8s-node-worker-02';
      const failingNode: KubernetesResource = {
        id: `res-${crypto.randomBytes(4).toString('hex')}`,
        clusterId,
        kind: 'Node',
        namespace: '',
        name: nodeName,
        status: 'NotReady',
        health: 'CRITICAL',
        createdAt: Date.now() - 86400000 * 7,
        updatedAt: Date.now(),
        specSummary: { osImage: 'Ubuntu 22.04.4 LTS', kernelVersion: '5.15.0-105-generic', kubeletVersion: 'v1.35.1' },
        statusSummary: { capacityCpu: '16', capacityMemory: '64Gi', allocatableCpu: '15.6', allocatableMemory: '60Gi' },
        conditions: [
          {
            type: 'Ready',
            status: 'False',
            reason: 'KubeletNotReady',
            message: 'runtime network not ready: NetworkReady=false reason:NetworkPluginNotReady message:docker: network plugin is not ready: cni plugin not initialized'
          },
          { type: 'MemoryPressure', status: 'False' },
          { type: 'DiskPressure', status: 'False' },
          { type: 'PIDPressure', status: 'False' }
        ],
        events: [
          {
            id: `evt-${crypto.randomBytes(4).toString('hex')}`,
            timestamp: Date.now() - 180000,
            type: 'Warning',
            reason: 'NodeNotReady',
            objectKind: 'Node',
            objectName: nodeName,
            namespace: '',
            message: 'Node k8s-node-worker-02 status is now: NodeNotReady'
          }
        ]
      };

      const existingIndex = resources.findIndex((r) => r.name === nodeName && r.kind === 'Node');
      if (existingIndex >= 0) resources[existingIndex] = failingNode;
      else resources.push(failingNode);

      this.syncClusterResources(clusterId, resources);
      const inc = this.evaluateResourceObservation(orgId, clusterId, cluster.name, failingNode);
      return { success: true, message: 'Injected Node NotReady condition on k8s-node-worker-02', incidentId: inc?.id };
    }

    if (scenario === 'DeploymentDegraded') {
      const depName = 'order-processing-service';
      const failingDep: KubernetesResource = {
        id: `res-${crypto.randomBytes(4).toString('hex')}`,
        clusterId,
        kind: 'Deployment',
        namespace: 'checkout-prod',
        name: depName,
        status: 'Degraded',
        health: 'CRITICAL',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now(),
        specSummary: { replicas: 5, strategy: 'RollingUpdate' },
        statusSummary: { replicas: 5, updatedReplicas: 2, readyReplicas: 0, availableReplicas: 0, unavailableReplicas: 5 },
        conditions: [
          { type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable', message: 'Deployment has minimum availability violations' },
          { type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'ReplicaSet "order-processing-service-89f4b" has timed out progressing.' }
        ],
        events: [
          {
            id: `evt-${crypto.randomBytes(4).toString('hex')}`,
            timestamp: Date.now() - 90000,
            type: 'Warning',
            reason: 'FailedCreate',
            objectKind: 'Deployment',
            objectName: depName,
            namespace: 'checkout-prod',
            message: 'Deployment does not have minimum availability (0/5 replicas available).'
          }
        ]
      };

      const existingIndex = resources.findIndex((r) => r.name === depName && r.kind === 'Deployment');
      if (existingIndex >= 0) resources[existingIndex] = failingDep;
      else resources.push(failingDep);

      this.syncClusterResources(clusterId, resources);
      const inc = this.evaluateResourceObservation(orgId, clusterId, cluster.name, failingDep);
      return { success: true, message: 'Injected Deployment Degraded on order-processing-service (0/5 replicas)', incidentId: inc?.id };
    }

    if (scenario === 'PVCPending') {
      const pvcName = 'postgres-data-vol-claim';
      const failingPvc: KubernetesResource = {
        id: `res-${crypto.randomBytes(4).toString('hex')}`,
        clusterId,
        kind: 'PersistentVolumeClaim',
        namespace: 'database',
        name: pvcName,
        status: 'Pending',
        health: 'WARNING',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
        specSummary: { storageClassName: 'ssd-premium-replicated', capacity: '250Gi', accessModes: ['ReadWriteOnce'] },
        statusSummary: { phase: 'Pending' },
        conditions: [],
        events: [
          {
            id: `evt-${crypto.randomBytes(4).toString('hex')}`,
            timestamp: Date.now() - 600000,
            type: 'Warning',
            reason: 'ProvisioningFailed',
            objectKind: 'PersistentVolumeClaim',
            objectName: pvcName,
            namespace: 'database',
            message: 'storageclass.storage.k8s.io "ssd-premium-replicated" not found: failed to provision volume'
          }
        ]
      };

      const existingIndex = resources.findIndex((r) => r.name === pvcName && (r.kind === 'PersistentVolumeClaim' || r.kind === 'PVC'));
      if (existingIndex >= 0) resources[existingIndex] = failingPvc;
      else resources.push(failingPvc);

      this.syncClusterResources(clusterId, resources);
      const inc = this.evaluateResourceObservation(orgId, clusterId, cluster.name, failingPvc);
      return { success: true, message: 'Injected PVC Pending condition on postgres-data-vol-claim', incidentId: inc?.id };
    }

    return { success: false, message: 'Unknown scenario' };
  }
}

export const store = new DataStore();
