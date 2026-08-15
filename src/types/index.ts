export type Role = 'OWNER' | 'ADMIN' | 'ENGINEER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
  membersCount: number;
}

export interface OrgMember {
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: number;
}

export type ClusterStatus =
  | 'pending'
  | 'installing'
  | 'agent_detected'
  | 'waiting_for_confirmation'
  | 'connected'
  | 'offline'
  | 'error'
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | 'AGENT_OFFLINE'
  | 'UNKNOWN';

export type AgentStatus = 'PENDING' | 'AGENT_DETECTED' | 'WAITING_CONFIRMATION' | 'CONNECTED' | 'DEGRADED' | 'OFFLINE' | 'ERROR';
export type ConnectionState = 'pending' | 'installing' | 'agent_detected' | 'waiting_for_confirmation' | 'connected' | 'offline' | 'error';

export interface Cluster {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  status: ClusterStatus;
  agentStatus: AgentStatus;
  connectionState?: ConnectionState;
  connectionCode?: string;
  connectionCodeExpiresAt?: number;
  agentDetectedAt?: number;
  agentVersion?: string;
  k8sVersion?: string;
  nodeCount: number;
  podCount: number;
  openIncidentCount: number;
  lastHeartbeat?: number;
  lastSeenAt?: number;
  createdAt: number;
  connectedAt?: number;
  agentToken?: string;
  isSimulated?: boolean;
}

export type IncidentSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type IncidentType =
  | 'CrashLoopBackOff'
  | 'ImagePullBackOff'
  | 'ErrImagePull'
  | 'OOMKilled'
  | 'PodPending'
  | 'PodFailed'
  | 'ExcessiveRestarts'
  | 'ContainerCreatingStuck'
  | 'NodeNotReady'
  | 'NodeMemoryPressure'
  | 'NodeDiskPressure'
  | 'NodePIDPressure'
  | 'DeploymentDegraded'
  | 'DeploymentRolloutStuck'
  | 'StatefulSetDegraded'
  | 'DaemonSetDegraded'
  | 'JobFailed'
  | 'CronJobFailed'
  | 'ServiceNoEndpoints'
  | 'ReadinessProbeFailed'
  | 'LivenessProbeFailed'
  | 'StartupProbeFailed'
  | 'PVCPending'
  | 'PVFailed'
  | 'StorageProvisioningFailed'
  | 'MissingConfigMap'
  | 'MissingSecret';

export interface ContainerDiagnostic {
  name: string;
  image: string;
  restartCount: number;
  ready: boolean;
  state: string;
  waitingReason?: string;
  waitingMessage?: string;
  terminationReason?: string;
  exitCode?: number;
}

export interface ConditionDiagnostic {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface TechnicalDetails {
  podName?: string;
  containerName?: string;
  image?: string;
  imageTag?: string;
  restartCount?: number;
  exitCode?: number;
  reason?: string;
  message?: string;
  nodeName?: string;
  containers?: ContainerDiagnostic[];
  conditions?: ConditionDiagnostic[];
  desiredReplicas?: number;
  availableReplicas?: number;
  readyReplicas?: number;
  updatedReplicas?: number;
  events?: K8sEvent[];
  pvcPhase?: string;
  storageClass?: string;
  capacity?: string;
}

export interface Incident {
  id: string; // e.g. "SKY-0001"
  fingerprint: string;
  orgId: string;
  clusterId: string;
  clusterName: string;
  namespace: string;
  resourceKind: string; // "Pod", "Deployment", "Node", "PVC", etc.
  resourceName: string;
  incidentType: IncidentType;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurrenceCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  resolvedAt?: number | null;
  technicalDetails: TechnicalDetails;
  assignee?: {
    userId: string;
    name: string;
    email: string;
  };
  updatedAt: number;
}

export type TimelineEventType =
  | 'DETECTION'
  | 'OCCURRENCE'
  | 'STATE_CHANGE'
  | 'SEVERITY_CHANGE'
  | 'ASSIGNMENT'
  | 'NOTE_ADDED'
  | 'RECOVERY'
  | 'MANUAL_UPDATE';

export interface TimelineEvent {
  id: string;
  incidentId: string;
  type: TimelineEventType;
  timestamp: number;
  actor: {
    type: 'SYSTEM' | 'AGENT' | 'USER';
    id?: string;
    name: string;
  };
  description: string;
  metadata?: Record<string, unknown>;
}

export interface IncidentNote {
  id: string;
  incidentId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: number;
}

export interface K8sEvent {
  id: string;
  timestamp: number;
  type: 'Normal' | 'Warning';
  reason: string;
  objectKind: string;
  objectName: string;
  namespace: string;
  message: string;
  count?: number;
}

export interface KubernetesResource {
  id: string;
  clusterId: string;
  kind: string;
  namespace: string;
  name: string;
  status: string;
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  createdAt: number;
  updatedAt: number;
  specSummary: Record<string, unknown>;
  statusSummary: Record<string, unknown>;
  conditions?: ConditionDiagnostic[];
  containers?: ContainerDiagnostic[];
  events?: K8sEvent[];
}

export interface OverviewMetrics {
  totalClusters: number;
  healthyClusters: number;
  warningClusters: number;
  criticalClusters: number;
  offlineClusters: number;
  openIncidents: number;
  criticalIncidents: number;
  highIncidents: number;
  mediumIncidents: number;
  lowIncidents: number;
  resolvedTodayCount: number;
}

export interface AgentManifestsResponse {
  clusterId: string;
  clusterName: string;
  token: string;
  connectionCode?: string;
  serverUrl: string;
  agentVersion: string;
  namespace: string;
  kubectlManifest: string;
  helmCommand: string;
  installCommand?: string;
  manifestDownloadUrl?: string;
}
