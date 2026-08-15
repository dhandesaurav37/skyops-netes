export interface ManifestConfig {
  clusterId: string;
  clusterName: string;
  token: string;
  serverUrl: string;
  agentVersion?: string;
  namespace?: string;
}

export function generateKubernetesManifest(config: ManifestConfig): string {
  const namespace = config.namespace || 'skyops-system';
  const agentVersion = config.agentVersion || 'v1.4.2';
  const encodedToken = Buffer.from(config.token).toString('base64');
  const encodedServer = Buffer.from(config.serverUrl).toString('base64');
  const encodedClusterId = Buffer.from(config.clusterId).toString('base64');

  return `---
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    app.kubernetes.io/name: skyops-agent
    app.kubernetes.io/part-of: skyops

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: skyops-agent
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: skyops-agent

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: skyops-agent-reader
  labels:
    app.kubernetes.io/name: skyops-agent
rules:
  - apiGroups: [""]
    resources:
      - pods
      - pods/status
      - nodes
      - nodes/status
      - namespaces
      - services
      - persistentvolumeclaims
      - persistentvolumes
      - configmaps
      - events
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources:
      - deployments
      - deployments/status
      - statefulsets
      - statefulsets/status
      - daemonsets
      - daemonsets/status
      - replicasets
    verbs: ["get", "list", "watch"]
  - apiGroups: ["batch"]
    resources:
      - jobs
      - cronjobs
    verbs: ["get", "list", "watch"]
  - apiGroups: ["networking.k8s.io"]
    resources:
      - ingresses
    verbs: ["get", "list", "watch"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: skyops-agent-reader-binding
  labels:
    app.kubernetes.io/name: skyops-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: skyops-agent-reader
subjects:
  - kind: ServiceAccount
    name: skyops-agent
    namespace: ${namespace}

---
apiVersion: v1
kind: Secret
metadata:
  name: skyops-agent-credentials
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: skyops-agent
type: Opaque
data:
  SKYOPS_AGENT_TOKEN: "${encodedToken}"
  SKYOPS_SERVER_URL: "${encodedServer}"
  SKYOPS_CLUSTER_ID: "${encodedClusterId}"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: skyops-agent
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: skyops-agent
    app.kubernetes.io/version: "${agentVersion}"
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: skyops-agent
  template:
    metadata:
      labels:
        app.kubernetes.io/name: skyops-agent
    spec:
      serviceAccountName: skyops-agent
      terminationGracePeriodSeconds: 30
      containers:
        - name: skyops-agent
          image: ghcr.io/skyops-io/agent:${agentVersion}
          imagePullPolicy: IfNotPresent
          env:
            - name: SKYOPS_CLUSTER_ID
              valueFrom:
                secretKeyRef:
                  name: skyops-agent-credentials
                  key: SKYOPS_CLUSTER_ID
            - name: SKYOPS_AGENT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: skyops-agent-credentials
                  key: SKYOPS_AGENT_TOKEN
            - name: SKYOPS_SERVER_URL
              valueFrom:
                secretKeyRef:
                  name: skyops-agent-credentials
                  key: SKYOPS_SERVER_URL
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
          resources:
            limits:
              cpu: 250m
              memory: 256Mi
            requests:
              cpu: 50m
              memory: 64Mi
          securityContext:
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65532
            capabilities:
              drop:
                - ALL
`;
}

export function generateHelmCommand(config: ManifestConfig): string {
  const namespace = config.namespace || 'skyops-system';
  return `helm repo add skyops https://charts.skyops.io
helm repo update
helm upgrade --install skyops-agent skyops/skyops-agent \\
  --namespace ${namespace} \\
  --create-namespace \\
  --set clusterId="${config.clusterId}" \\
  --set agentToken="${config.token}" \\
  --set serverUrl="${config.serverUrl}"`;
}
