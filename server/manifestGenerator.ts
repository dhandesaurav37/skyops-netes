import { dump } from 'js-yaml';
import { AGENT_DEFAULT_NAMESPACE, AGENT_IMAGE_REPOSITORY, AGENT_VERSION } from '../src/config/version';

export interface ManifestConfig {
  clusterId: string;
  clusterName: string;
  token: string;
  serverUrl: string;
  agentVersion?: string;
  namespace?: string;
}

export function generateKubernetesManifest(config: ManifestConfig): string {
  const namespace = config.namespace || AGENT_DEFAULT_NAMESPACE;
  const agentVersion = config.agentVersion || AGENT_VERSION;
  const encodedToken = Buffer.from(config.token).toString('base64');
  const encodedServer = Buffer.from(config.serverUrl).toString('base64');
  const encodedClusterId = Buffer.from(config.clusterId).toString('base64');

  const collectorScript = `echo "[SkyOps] Telemetry Collector Daemon initialized"
if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "[SkyOps] Installing curl & jq utilities..."
  apk add --no-cache curl jq >/dev/null 2>&1 || true
fi

while true; do
  TOKEN="$SKYOPS_AGENT_TOKEN"
  SERVER="$SKYOPS_SERVER_URL"
  CID="$SKYOPS_CLUSTER_ID"
  PAYLOAD="/tmp/telemetry.json"
  RESP_FILE="/tmp/resp.txt"
  ERR_FILE="/tmp/curl_err.txt"

  # Capture complete cluster state
  K8S_RAW=$(kubectl get nodes,pods,deployments,daemonsets,statefulsets,pvc -A -o json 2>/dev/null)
  if [ -z "$K8S_RAW" ]; then
    K8S_RAW='{"apiVersion":"v1","kind":"List","items":[]}'
  fi

  # Construct clean payload using jq if available, otherwise strict JSON format
  if command -v jq >/dev/null 2>&1; then
    echo "$K8S_RAW" | jq -c --arg cid "$CID" '{clusterId: $cid, rawK8sList: .}' > "$PAYLOAD" 2>/dev/null
  else
    echo "{\\"clusterId\\":\\"$CID\\",\\"rawK8sList\\":$K8S_RAW}" > "$PAYLOAD"
  fi

  # Validate payload with jq before transmitting
  PAYLOAD_VALID=true
  if command -v jq >/dev/null 2>&1; then
    if ! jq empty "$PAYLOAD" >/dev/null 2>&1; then
      PAYLOAD_VALID=false
      echo "[SkyOps Collector $(date -u +%T)] Telemetry payload JSON validation FAILED"
    fi
  fi

  # Dispatch telemetry payload directly to SkyOps Central Ingestion API
  if [ "$PAYLOAD_VALID" = "true" ] && command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -k -s -S -o "$RESP_FILE" -w "%{http_code}" -X POST "$SERVER/api/v1/agent/telemetry" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @"$PAYLOAD" 2>"$ERR_FILE")
    CURL_EXIT=$?
    RESP_BODY=$(cat "$RESP_FILE" 2>/dev/null)

    if [ $CURL_EXIT -eq 0 ]; then
      case "$HTTP_CODE" in
        2*)
          echo "[SkyOps Collector $(date -u +%T)] Telemetry sync OK [HTTP $HTTP_CODE]: $RESP_BODY"
          ;;
        *)
          echo "[SkyOps Collector $(date -u +%T)] Telemetry sync FAILED [HTTP $HTTP_CODE]: $RESP_BODY"
          ;;
      esac
    else
      ERR_MSG=$(cat "$ERR_FILE" 2>/dev/null)
      echo "[SkyOps Collector $(date -u +%T)] Telemetry network error (exit $CURL_EXIT): $ERR_MSG"
    fi

    curl -k -s -X POST "$SERVER/api/v1/agent/heartbeat" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\\"clusterId\\":\\"$CID\\",\\"agentVersion\\":\\"v1.5.0\\"}" >/dev/null 2>&1 || true
  fi

  rm -f "$PAYLOAD" "$RESP_FILE" "$ERR_FILE"
  sleep 10
done`;

  const documents = [
    {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespace,
        labels: {
          'app.kubernetes.io/name': 'skyops-agent',
          'app.kubernetes.io/part-of': 'skyops',
        },
      },
    },
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: 'skyops-agent',
        namespace,
        labels: {
          'app.kubernetes.io/name': 'skyops-agent',
        },
      },
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRole',
      metadata: {
        name: 'skyops-agent-reader',
        labels: {
          'app.kubernetes.io/name': 'skyops-agent',
        },
      },
      rules: [
        {
          apiGroups: [''],
          resources: [
            'pods',
            'pods/status',
            'nodes',
            'nodes/status',
            'namespaces',
            'services',
            'persistentvolumeclaims',
            'persistentvolumes',
            'configmaps',
            'events',
          ],
          verbs: ['get', 'list', 'watch'],
        },
        {
          apiGroups: ['apps'],
          resources: [
            'deployments',
            'deployments/status',
            'statefulsets',
            'statefulsets/status',
            'daemonsets',
            'daemonsets/status',
            'replicasets',
          ],
          verbs: ['get', 'list', 'watch'],
        },
        {
          apiGroups: ['batch'],
          resources: ['jobs', 'cronjobs'],
          verbs: ['get', 'list', 'watch'],
        },
        {
          apiGroups: ['networking.k8s.io'],
          resources: ['ingresses'],
          verbs: ['get', 'list', 'watch'],
        },
      ],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRoleBinding',
      metadata: {
        name: 'skyops-agent-reader-binding',
        labels: {
          'app.kubernetes.io/name': 'skyops-agent',
        },
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: 'skyops-agent-reader',
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: 'skyops-agent',
          namespace,
        },
      ],
    },
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'skyops-agent-credentials',
        namespace,
        labels: {
          'app.kubernetes.io/name': 'skyops-agent',
        },
      },
      type: 'Opaque',
      data: {
        SKYOPS_AGENT_TOKEN: encodedToken,
        SKYOPS_SERVER_URL: encodedServer,
        SKYOPS_CLUSTER_ID: encodedClusterId,
      },
    },
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'skyops-agent',
        namespace,
        labels: {
          'app.kubernetes.io/name': 'skyops-agent',
          'app.kubernetes.io/version': agentVersion,
        },
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'skyops-agent',
          },
        },
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': 'skyops-agent',
            },
          },
          spec: {
            serviceAccountName: 'skyops-agent',
            terminationGracePeriodSeconds: 30,
            containers: [
              {
                name: 'skyops-agent',
                image: `${AGENT_IMAGE_REPOSITORY}:${agentVersion}`,
                imagePullPolicy: 'IfNotPresent',
                env: [
                  {
                    name: 'SKYOPS_CLUSTER_ID',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'skyops-agent-credentials',
                        key: 'SKYOPS_CLUSTER_ID',
                      },
                    },
                  },
                  {
                    name: 'SKYOPS_AGENT_TOKEN',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'skyops-agent-credentials',
                        key: 'SKYOPS_AGENT_TOKEN',
                      },
                    },
                  },
                  {
                    name: 'SKYOPS_SERVER_URL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'skyops-agent-credentials',
                        key: 'SKYOPS_SERVER_URL',
                      },
                    },
                  },
                  {
                    name: 'NODE_NAME',
                    valueFrom: {
                      fieldRef: {
                        fieldPath: 'spec.nodeName',
                      },
                    },
                  },
                  {
                    name: 'KUBERNETES_INSECURE_SKIP_TLS_VERIFY',
                    value: 'true',
                  },
                ],
                resources: {
                  limits: {
                    cpu: '250m',
                    memory: '256Mi',
                  },
                  requests: {
                    cpu: '50m',
                    memory: '64Mi',
                  },
                },
                securityContext: {
                  readOnlyRootFilesystem: true,
                  allowPrivilegeEscalation: false,
                  runAsNonRoot: true,
                  runAsUser: 65532,
                  capabilities: {
                    drop: ['ALL'],
                  },
                },
              },
              {
                name: 'skyops-telemetry-collector',
                image: 'alpine/k8s:1.31.2',
                imagePullPolicy: 'IfNotPresent',
                env: [
                  {
                    name: 'SKYOPS_CLUSTER_ID',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'skyops-agent-credentials',
                        key: 'SKYOPS_CLUSTER_ID',
                      },
                    },
                  },
                  {
                    name: 'SKYOPS_AGENT_TOKEN',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'skyops-agent-credentials',
                        key: 'SKYOPS_AGENT_TOKEN',
                      },
                    },
                  },
                  {
                    name: 'SKYOPS_SERVER_URL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'skyops-agent-credentials',
                        key: 'SKYOPS_SERVER_URL',
                      },
                    },
                  },
                ],
                command: ['/bin/sh', '-c', collectorScript],
                resources: {
                  limits: {
                    cpu: '250m',
                    memory: '256Mi',
                  },
                  requests: {
                    cpu: '50m',
                    memory: '64Mi',
                  },
                },
              },
            ],
          },
        },
      },
    },
  ];

  return documents.map(doc => dump(doc, { lineWidth: 1000, noRefs: true })).join('---\n');
}

export function generateHelmCommand(config: ManifestConfig): string {
  const namespace = config.namespace || AGENT_DEFAULT_NAMESPACE;
  return `helm repo add skyops https://charts.skyops.io
helm repo update
helm upgrade --install skyops-agent skyops/skyops-agent \\
  --namespace ${namespace} \\
  --create-namespace \\
  --set clusterId="${config.clusterId}" \\
  --set agentToken="${config.token}" \\
  --set serverUrl="${config.serverUrl}"`;
}

export function generateKubectlCommand(serverUrl: string, clusterId: string, installKey?: string): string {
  const installParam = installKey ? `?key=${installKey}` : '';
  return `kubectl apply -f "${serverUrl}/api/v1/clusters/${clusterId}/manifest.yaml${installParam}"`;
}

export function generateInstallCommand(serverUrl: string, clusterId: string, installKey?: string): string {
  const installParam = installKey ? `?key=${installKey}` : '';
  return `kubectl apply -f "${serverUrl}/api/v1/clusters/${clusterId}/manifest.yaml${installParam}"`;
}

export function generateHelmValues(config: ManifestConfig): string {
  return `replicaCount: 1
image:
  repository: ${AGENT_IMAGE_REPOSITORY}
  pullPolicy: IfNotPresent
  tag: "${config.agentVersion || AGENT_VERSION}"

clusterId: "${config.clusterId}"
agentToken: "${config.token}"
serverUrl: "${config.serverUrl}"

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
`;
}
