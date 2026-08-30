package collector

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// InClusterK8sClient performs in-cluster Kubernetes API calls using the mounted ServiceAccount token and CA cert
type InClusterK8sClient struct {
	httpClient *http.Client
	apiBaseURL string
	token      string
}

func NewInClusterK8sClient() (*InClusterK8sClient, error) {
	host := os.Getenv("KUBERNETES_SERVICE_HOST")
	port := os.Getenv("KUBERNETES_SERVICE_PORT")
	if host == "" || port == "" {
		host = "kubernetes.default.svc"
		port = "443"
	}

	tokenBytes, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")
	if err != nil {
		return nil, fmt.Errorf("unable to read serviceaccount token: %w", err)
	}

	caCertPool, _ := x509.SystemCertPool()
	if caCertPool == nil {
		caCertPool = x509.NewCertPool()
	}
	caCertBytes, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
	if err == nil && len(caCertBytes) > 0 {
		caCertPool.AppendCertsFromPEM(caCertBytes)
	}

	insecureSkip := os.Getenv("KUBERNETES_INSECURE_SKIP_TLS_VERIFY") == "true"

	tlsConfig := &tls.Config{
		RootCAs:            caCertPool,
		InsecureSkipVerify: insecureSkip,
	}

	transport := &http.Transport{
		TLSClientConfig: tlsConfig,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   20 * time.Second,
	}

	baseURL := fmt.Sprintf("https://%s:%s", host, port)

	return &InClusterK8sClient{
		httpClient: client,
		apiBaseURL: baseURL,
		token:      strings.TrimSpace(string(tokenBytes)),
	}, nil
}

func (k *InClusterK8sClient) GetJSON(ctx context.Context, apiPath string, target interface{}) error {
	url := fmt.Sprintf("%s%s", k.apiBaseURL, apiPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+k.token)
	req.Header.Set("Accept", "application/json")

	resp, err := k.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("kubernetes API GET %s returned HTTP %d: %s", apiPath, resp.StatusCode, string(body))
	}

	return json.NewDecoder(resp.Body).Decode(target)
}

// K8sVersionInfo represents the response from /version
type K8sVersionInfo struct {
	Major        string `json:"major"`
	Minor        string `json:"minor"`
	GitVersion   string `json:"gitVersion"`
	GitCommit    string `json:"gitCommit"`
	GitTreeState string `json:"gitTreeState"`
	BuildDate    string `json:"buildDate"`
	GoVersion    string `json:"goVersion"`
	Compiler     string `json:"compiler"`
	Platform     string `json:"platform"`
}

// GetServerVersion queries /version to discover the live Kubernetes version
func (k *InClusterK8sClient) GetServerVersion(ctx context.Context) (string, error) {
	var verInfo K8sVersionInfo
	if err := k.GetJSON(ctx, "/version", &verInfo); err != nil {
		return "", err
	}
	if verInfo.GitVersion != "" {
		return verInfo.GitVersion, nil
	}
	if verInfo.Major != "" && verInfo.Minor != "" {
		return fmt.Sprintf("v%s.%s", verInfo.Major, verInfo.Minor), nil
	}
	return "", fmt.Errorf("no version string found in /version response")
}

// Low-level K8s object schemas
type K8sListMeta struct {
	ResourceVersion string `json:"resourceVersion"`
}

type K8sObjectMeta struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	UID               string            `json:"uid"`
	CreationTimestamp string            `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

type K8sNodeList struct {
	Items []K8sNode `json:"items"`
}

type K8sNode struct {
	Metadata K8sObjectMeta `json:"metadata"`
	Spec     struct {
		PodCIDR string `json:"podCIDR"`
	} `json:"spec"`
	Status struct {
		Capacity    map[string]string `json:"capacity"`
		Allocatable map[string]string `json:"allocatable"`
		NodeInfo    struct {
			KubeletVersion          string `json:"kubeletVersion"`
			OSImage                 string `json:"osImage"`
			Architecture            string `json:"architecture"`
			ContainerRuntimeVersion string `json:"containerRuntimeVersion"`
		} `json:"nodeInfo"`
		Conditions []struct {
			Type               string `json:"type"`
			Status             string `json:"status"`
			Reason             string `json:"reason"`
			Message            string `json:"message"`
			LastTransitionTime string `json:"lastTransitionTime"`
		} `json:"conditions"`
	} `json:"status"`
}

type K8sPodList struct {
	Items []K8sPod `json:"items"`
}

type K8sPod struct {
	Metadata K8sObjectMeta `json:"metadata"`
	Spec     struct {
		NodeName   string `json:"nodeName"`
		Containers []struct {
			Name      string `json:"name"`
			Image     string `json:"image"`
			Resources struct {
				Limits map[string]string `json:"limits"`
			} `json:"resources"`
		} `json:"containers"`
	} `json:"spec"`
	Status struct {
		Phase      string `json:"phase"`
		PodIP      string `json:"podIP"`
		HostIP     string `json:"hostIP"`
		StartTime  string `json:"startTime"`
		Conditions []struct {
			Type               string `json:"type"`
			Status             string `json:"status"`
			Reason             string `json:"reason"`
			Message            string `json:"message"`
			LastTransitionTime string `json:"lastTransitionTime"`
		} `json:"conditions"`
		ContainerStatuses []struct {
			Name         string `json:"name"`
			Image        string `json:"image"`
			Ready        bool   `json:"ready"`
			RestartCount int    `json:"restartCount"`
			State        struct {
				Waiting *struct {
					Reason  string `json:"reason"`
					Message string `json:"message"`
				} `json:"waiting"`
				Running *struct {
					StartedAt string `json:"startedAt"`
				} `json:"running"`
				Terminated *struct {
					ExitCode int    `json:"exitCode"`
					Reason   string `json:"reason"`
					Message  string `json:"message"`
				} `json:"terminated"`
			} `json:"state"`
			LastState struct {
				Terminated *struct {
					ExitCode int    `json:"exitCode"`
					Reason   string `json:"reason"`
				} `json:"terminated"`
			} `json:"lastState"`
		} `json:"containerStatuses"`
	} `json:"status"`
}

type K8sDeploymentList struct {
	Items []K8sDeployment `json:"items"`
}

type K8sDeployment struct {
	Metadata K8sObjectMeta `json:"metadata"`
	Spec     struct {
		Replicas int `json:"replicas"`
	} `json:"spec"`
	Status struct {
		Replicas            int `json:"replicas"`
		ReadyReplicas       int `json:"readyReplicas"`
		AvailableReplicas   int `json:"availableReplicas"`
		UpdatedReplicas     int `json:"updatedReplicas"`
		UnavailableReplicas int `json:"unavailableReplicas"`
		Conditions          []struct {
			Type               string `json:"type"`
			Status             string `json:"status"`
			Reason             string `json:"reason"`
			Message            string `json:"message"`
			LastTransitionTime string `json:"lastTransitionTime"`
		} `json:"conditions"`
	} `json:"status"`
}

type K8sStatefulSetList struct {
	Items []K8sStatefulSet `json:"items"`
}

type K8sStatefulSet struct {
	Metadata K8sObjectMeta `json:"metadata"`
	Spec     struct {
		Replicas int `json:"replicas"`
	} `json:"spec"`
	Status struct {
		Replicas        int `json:"replicas"`
		ReadyReplicas   int `json:"readyReplicas"`
		CurrentReplicas int `json:"currentReplicas"`
		UpdatedReplicas int `json:"updatedReplicas"`
	} `json:"status"`
}

type K8sDaemonSetList struct {
	Items []K8sDaemonSet `json:"items"`
}

type K8sDaemonSet struct {
	Metadata K8sObjectMeta `json:"metadata"`
	Status   struct {
		DesiredNumberScheduled int `json:"desiredNumberScheduled"`
		CurrentNumberScheduled int `json:"currentNumberScheduled"`
		NumberReady            int `json:"numberReady"`
		NumberAvailable        int `json:"numberAvailable"`
		NumberMisscheduled     int `json:"numberMisscheduled"`
	} `json:"status"`
}

type K8sPVCList struct {
	Items []K8sPVC `json:"items"`
}

type K8sPVC struct {
	Metadata K8sObjectMeta `json:"metadata"`
	Spec     struct {
		StorageClassName string   `json:"storageClassName"`
		VolumeName       string   `json:"volumeName"`
		AccessModes      []string `json:"accessModes"`
		Resources        struct {
			Requests map[string]string `json:"requests"`
		} `json:"resources"`
	} `json:"spec"`
	Status struct {
		Phase    string            `json:"phase"`
		Capacity map[string]string `json:"capacity"`
	} `json:"status"`
}

type K8sEventList struct {
	Items []K8sEvent `json:"items"`
}

type K8sEvent struct {
	Metadata       K8sObjectMeta `json:"metadata"`
	InvolvedObject struct {
		Kind      string `json:"kind"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
		UID       string `json:"uid"`
	} `json:"involvedObject"`
	Reason         string `json:"reason"`
	Message        string `json:"message"`
	Type           string `json:"type"`
	Count          int    `json:"count"`
	FirstTimestamp string `json:"firstTimestamp"`
	LastTimestamp  string `json:"lastTimestamp"`
	EventTime      string `json:"eventTime"`
}
