import {
  AgentManifestsResponse,
  Cluster,
  Incident,
  IncidentNote,
  IncidentSeverity,
  IncidentStatus,
  KubernetesResource,
  Organization,
  OrgMember,
  OverviewMetrics,
  Role,
  TimelineEvent,
  User
} from '../types/index';

class ApiClient {
  private getHeaders(): HeadersInit {
    const savedUser = localStorage.getItem('skyops_user');
    const savedOrg = localStorage.getItem('skyops_active_org_id');

    let email = 'sre-lead@acme.corp';
    let name = 'Alex Rivera (Staff SRE)';

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        email = parsed.email || email;
        name = parsed.name || name;
      } catch {
        // use default
      }
    }

    return {
      'Content-Type': 'application/json',
      'x-user-email': email,
      'x-user-name': name,
      'x-org-id': savedOrg || ''
    };
  }

  // --- Auth & Session ---
  async getSession(): Promise<{
    user: User;
    currentOrg: Organization;
    organizations: Organization[];
    role: Role;
    members: OrgMember[];
  }> {
    const res = await fetch('/api/v1/auth/session', {
      method: 'POST',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error(`Session fetch failed: ${res.statusText}`);
    return res.json();
  }

  // --- Organizations ---
  async getOrganizations(): Promise<Organization[]> {
    const res = await fetch('/api/v1/orgs', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch organizations');
    const data = await res.json();
    return data.organizations;
  }

  async createOrganization(name: string): Promise<Organization> {
    const res = await fetch('/api/v1/orgs', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to create organization');
    const data = await res.json();
    return data.organization;
  }

  // --- Clusters ---
  async getClusters(): Promise<Cluster[]> {
    const res = await fetch('/api/v1/clusters', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch clusters');
    const data = await res.json();
    return data.clusters;
  }

  async createCluster(name: string, description?: string): Promise<{ cluster: Cluster; token: string }> {
    const res = await fetch('/api/v1/clusters', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) throw new Error('Failed to create cluster');
    return res.json();
  }

  async getCluster(id: string): Promise<Cluster> {
    const res = await fetch(`/api/v1/clusters/${id}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch cluster details');
    const data = await res.json();
    return data.cluster;
  }

  async deleteCluster(id: string): Promise<void> {
    const res = await fetch(`/api/v1/clusters/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete cluster');
  }

  async getClusterManifests(clusterId: string): Promise<AgentManifestsResponse> {
    const res = await fetch(`/api/v1/clusters/${clusterId}/manifests`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to generate agent manifests');
    return res.json();
  }

  async getClusterResources(clusterId: string): Promise<KubernetesResource[]> {
    const res = await fetch(`/api/v1/clusters/${clusterId}/resources`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch cluster resources');
    const data = await res.json();
    return data.resources;
  }

  // --- Incidents ---
  async getIncidents(filters?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    clusterId?: string;
    namespace?: string;
    search?: string;
  }): Promise<Incident[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.clusterId) params.set('clusterId', filters.clusterId);
    if (filters?.namespace) params.set('namespace', filters.namespace);
    if (filters?.search) params.set('search', filters.search);

    const url = `/api/v1/incidents${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch incidents');
    const data = await res.json();
    return data.incidents;
  }

  async getIncident(id: string): Promise<{ incident: Incident; timeline: TimelineEvent[]; notes: IncidentNote[] }> {
    const res = await fetch(`/api/v1/incidents/${id}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch incident details');
    return res.json();
  }

  async updateIncident(
    id: string,
    updates: {
      status?: IncidentStatus;
      severity?: IncidentSeverity;
      title?: string;
      assignee?: { userId: string; name: string; email: string };
    }
  ): Promise<Incident> {
    const res = await fetch(`/api/v1/incidents/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update incident');
    const data = await res.json();
    return data.incident;
  }

  async addIncidentNote(incidentId: string, content: string): Promise<IncidentNote> {
    const res = await fetch(`/api/v1/incidents/${incidentId}/notes`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error('Failed to add investigation note');
    const data = await res.json();
    return data.note;
  }

  // --- Overview ---
  async getOverview(): Promise<{
    metrics: OverviewMetrics;
    clusters: Cluster[];
    recentIncidents: Incident[];
    recentActivity: Array<{
      id: string;
      type: string;
      timestamp: number;
      title: string;
      description: string;
      incidentId?: string;
      clusterId?: string;
    }>;
  }> {
    const res = await fetch('/api/v1/overview', { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch overview metrics');
    return res.json();
  }

  // --- Development & QA Testing Simulation ---
  async simulateScenario(
    clusterId: string,
    scenario:
      | 'CrashLoopBackOff'
      | 'ImagePullBackOff'
      | 'OOMKilled'
      | 'NodeNotReady'
      | 'DeploymentDegraded'
      | 'PVCPending'
      | 'RecoverAll'
  ): Promise<{ success: boolean; message: string; incidentId?: string }> {
    const res = await fetch('/api/v1/dev/simulate-scenario', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ clusterId, scenario })
    });
    if (!res.ok) throw new Error('Failed to simulate scenario');
    return res.json();
  }
}

export const api = new ApiClient();
