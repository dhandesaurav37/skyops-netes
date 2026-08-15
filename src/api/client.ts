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

  /**
   * Safe centralized request executor that gracefully parses JSON and handles HTML/proxy errors
   */
  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {})
    };

    let res: Response;
    try {
      res = await fetch(url, { ...options, headers });
    } catch (netErr: any) {
      throw new Error(`Network connection error: ${netErr?.message || 'Failed to fetch'}`);
    }

    const text = await res.text();
    let data: any;

    if (text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<!doctype')) {
      // HTML response received (e.g. 404 from static file server or SPA fallback)
      if (!res.ok) {
        throw new Error(`API error (${res.status} ${res.statusText})`);
      }
      throw new Error(`Received unexpected HTML response from ${url}`);
    }

    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      if (!res.ok) {
        throw new Error(`API error (${res.status} ${res.statusText})`);
      }
      throw new Error(`Malformed JSON response from ${url}`);
    }

    if (!res.ok) {
      const errMsg = data?.error || `API request failed with status ${res.status}`;
      throw new Error(errMsg);
    }

    return data as T;
  }

  // --- Auth & Session ---
  async getSession(): Promise<{
    user: User;
    currentOrg: Organization;
    organizations: Organization[];
    role: Role;
    members: OrgMember[];
  }> {
    return this.request('/api/v1/auth/session', { method: 'POST' });
  }

  // --- Organizations ---
  async getOrganizations(): Promise<Organization[]> {
    const data = await this.request<{ organizations: Organization[] }>('/api/v1/orgs');
    return data.organizations;
  }

  async createOrganization(name: string): Promise<Organization> {
    const data = await this.request<{ organization: Organization }>('/api/v1/orgs', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return data.organization;
  }

  // --- Clusters ---
  async getClusters(): Promise<Cluster[]> {
    const data = await this.request<{ clusters: Cluster[] }>('/api/v1/clusters');
    return data.clusters;
  }

  async createCluster(
    name: string,
    description?: string
  ): Promise<{ cluster: Cluster; token: string; connectionCode?: string }> {
    return this.request<{ cluster: Cluster; token: string; connectionCode?: string }>('/api/v1/clusters', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
  }

  async connectCluster(clusterId: string, connectionCode: string): Promise<{ success: boolean; cluster: Cluster }> {
    return this.request<{ success: boolean; cluster: Cluster }>(`/api/v1/clusters/${clusterId}/connect`, {
      method: 'POST',
      body: JSON.stringify({ connectionCode })
    });
  }

  async regenerateClusterToken(
    clusterId: string
  ): Promise<{ success: boolean; cluster: Cluster; token: string; connectionCode: string }> {
    return this.request<{ success: boolean; cluster: Cluster; token: string; connectionCode: string }>(
      `/api/v1/clusters/${clusterId}/regenerate-token`,
      { method: 'POST' }
    );
  }

  async disconnectCluster(clusterId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/v1/clusters/${clusterId}/disconnect`, {
      method: 'POST'
    });
  }

  async getCluster(id: string): Promise<Cluster> {
    const data = await this.request<{ cluster: Cluster }>(`/api/v1/clusters/${id}`);
    return data.cluster;
  }

  async deleteCluster(id: string): Promise<void> {
    await this.request<{ success: boolean }>(`/api/v1/clusters/${id}`, {
      method: 'DELETE'
    });
  }

  async getClusterManifests(clusterId: string): Promise<AgentManifestsResponse> {
    return this.request<AgentManifestsResponse>(`/api/v1/clusters/${clusterId}/manifests`);
  }

  async getClusterResources(clusterId: string): Promise<KubernetesResource[]> {
    const data = await this.request<{ resources: KubernetesResource[] }>(`/api/v1/clusters/${clusterId}/resources`);
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
    const data = await this.request<{ incidents: Incident[] }>(url);
    return data.incidents;
  }

  async getIncident(id: string): Promise<{ incident: Incident; timeline: TimelineEvent[]; notes: IncidentNote[] }> {
    return this.request<{ incident: Incident; timeline: TimelineEvent[]; notes: IncidentNote[] }>(`/api/v1/incidents/${id}`);
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
    const data = await this.request<{ incident: Incident }>(`/api/v1/incidents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    return data.incident;
  }

  async addIncidentNote(incidentId: string, content: string): Promise<IncidentNote> {
    const data = await this.request<{ note: IncidentNote }>(`/api/v1/incidents/${incidentId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
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
    return this.request<{
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
    }>('/api/v1/overview');
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
    return this.request<{ success: boolean; message: string; incidentId?: string }>('/api/v1/dev/simulate-scenario', {
      method: 'POST',
      body: JSON.stringify({ clusterId, scenario })
    });
  }
}

export const api = new ApiClient();
