package collector

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/queue"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

// ResourceObservation represents a monitored Kubernetes resource
type ResourceObservation struct {
	ID            string                 `json:"id,omitempty"`
	ClusterID     string                 `json:"clusterId,omitempty"`
	Kind          string                 `json:"kind"`
	Namespace     string                 `json:"namespace"`
	Name          string                 `json:"name"`
	Status        string                 `json:"status"`
	Health        string                 `json:"health"`
	CreatedAt     int64                  `json:"createdAt"`
	UpdatedAt     int64                  `json:"updatedAt"`
	SpecSummary   map[string]interface{} `json:"specSummary"`
	StatusSummary map[string]interface{} `json:"statusSummary"`
	Containers    []ContainerStatus      `json:"containers,omitempty"`
	Conditions    []ConditionStatus      `json:"conditions,omitempty"`
	Events        []EventObservation     `json:"events,omitempty"`
}

type ContainerStatus struct {
	Name              string `json:"name"`
	Image             string `json:"image"`
	RestartCount      int    `json:"restartCount"`
	Ready             bool   `json:"ready"`
	State             string `json:"state"`
	WaitingReason     string `json:"waitingReason,omitempty"`
	WaitingMessage    string `json:"waitingMessage,omitempty"`
	TerminationReason string `json:"terminationReason,omitempty"`
	ExitCode          int    `json:"exitCode,omitempty"`
}

type ConditionStatus struct {
	Type               string `json:"type"`
	Status             string `json:"status"`
	Reason             string `json:"reason,omitempty"`
	Message            string `json:"message,omitempty"`
	LastTransitionTime string `json:"lastTransitionTime,omitempty"`
}

type EventObservation struct {
	ID         string `json:"id"`
	Timestamp  int64  `json:"timestamp"`
	Type       string `json:"type"`
	Reason     string `json:"reason"`
	ObjectKind string `json:"objectKind"`
	ObjectName string `json:"objectName"`
	Namespace  string `json:"namespace"`
	Message    string `json:"message"`
}

type Collector struct {
	cfg       *config.Config
	client    *transport.Client
	queue     *queue.BoundedQueue
	k8sClient *InClusterK8sClient
}

func NewCollector(cfg *config.Config, client *transport.Client, q *queue.BoundedQueue) *Collector {
	kClient, err := NewInClusterK8sClient()
	if err != nil {
		slog.Warn("Running in standalone observation mode (in-cluster K8s API client disabled)", "reason", err.Error())
	} else {
		slog.Info("Successfully initialized Kubernetes in-cluster API client")
	}

	return &Collector{
		cfg:       cfg,
		client:    client,
		queue:     q,
		k8sClient: kClient,
	}
}

// Start begins the informer watch / scrape loop and periodic telemetry dispatcher
func (c *Collector) Start(ctx context.Context) {
	ticker := time.NewTicker(c.cfg.TelemetryInterval)
	defer ticker.Stop()

	slog.Info("Kubernetes resource collector started", "interval", c.cfg.TelemetryInterval.String())

	// Execute initial immediate scrape
	c.collectFromKubernetes(ctx)
	c.flushQueue(ctx)

	for {
		select {
		case <-ctx.Done():
			slog.Info("Resource collector shutting down")
			return
		case <-ticker.C:
			c.collectFromKubernetes(ctx)
			c.flushQueue(ctx)
		}
	}
}

func (c *Collector) RecordObservation(res ResourceObservation) {
	c.queue.Push(queue.Item{
		Type:    "RESOURCE_UPDATE",
		Payload: res,
	})
}

// collectFromKubernetes polls Kubernetes API endpoints for Nodes, Pods, Deployments and Events
func (c *Collector) collectFromKubernetes(ctx context.Context) {
	if c.k8sClient == nil {
		return
	}

	// 1. Fetch Events first to correlate with pods/nodes
	var eventList K8sEventList
	eventsMap := make(map[string][]EventObservation)
	if err := c.k8sClient.GetJSON(ctx, "/api/v1/events?limit=250", &eventList); err == nil {
		for _, evt := range eventList.Items {
			key := fmt.Sprintf("%s/%s/%s", evt.InvolvedObject.Kind, evt.InvolvedObject.Namespace, evt.InvolvedObject.Name)
			ts := time.Now().UnixMilli()
			if evt.LastTimestamp != "" {
				if t, err := time.Parse(time.RFC3339, evt.LastTimestamp); err == nil {
					ts = t.UnixMilli()
				}
			}
			eventsMap[key] = append(eventsMap[key], EventObservation{
				ID:         evt.Metadata.UID,
				Timestamp:  ts,
				Type:       evt.Type,
				Reason:     evt.Reason,
				ObjectKind: evt.InvolvedObject.Kind,
				ObjectName: evt.InvolvedObject.Name,
				Namespace:  evt.InvolvedObject.Namespace,
				Message:    evt.Message,
			})
		}
	}

	// 2. Fetch Nodes
	var nodeList K8sNodeList
	if err := c.k8sClient.GetJSON(ctx, "/api/v1/nodes", &nodeList); err == nil {
		for _, node := range nodeList.Items {
			conditions := make([]ConditionStatus, 0)
			isReady := false
			for _, cond := range node.Status.Conditions {
				conditions = append(conditions, ConditionStatus{
					Type:               cond.Type,
					Status:             cond.Status,
					Reason:             cond.Reason,
					Message:            cond.Message,
					LastTransitionTime: cond.LastTransitionTime,
				})
				if cond.Type == "Ready" && cond.Status == "True" {
					isReady = true
				}
			}

			status := "NotReady"
			health := "CRITICAL"
			if isReady {
				status = "Ready"
				health = "HEALTHY"
			}

			createdTs := time.Now().UnixMilli()
			if node.Metadata.CreationTimestamp != "" {
				if t, err := time.Parse(time.RFC3339, node.Metadata.CreationTimestamp); err == nil {
					createdTs = t.UnixMilli()
				}
			}

			nodeEvents := eventsMap[fmt.Sprintf("Node//%s", node.Metadata.Name)]

			c.RecordObservation(ResourceObservation{
				Kind:      "Node",
				Namespace: "",
				Name:      node.Metadata.Name,
				Status:    status,
				Health:    health,
				CreatedAt: createdTs,
				UpdatedAt: time.Now().UnixMilli(),
				SpecSummary: map[string]interface{}{
					"podCIDR": node.Spec.PodCIDR,
				},
				StatusSummary: map[string]interface{}{
					"kubeletVersion": node.Status.NodeInfo.KubeletVersion,
					"osImage":        node.Status.NodeInfo.OSImage,
					"architecture":   node.Status.NodeInfo.Architecture,
					"capacity":       node.Status.Capacity,
					"allocatable":    node.Status.Allocatable,
				},
				Conditions: conditions,
				Events:     nodeEvents,
			})
		}
	}

	// 3. Fetch Pods
	var podList K8sPodList
	if err := c.k8sClient.GetJSON(ctx, "/api/v1/pods", &podList); err == nil {
		for _, pod := range podList.Items {
			containers := make([]ContainerStatus, 0)
			conditions := make([]ConditionStatus, 0)

			for _, cond := range pod.Status.Conditions {
				conditions = append(conditions, ConditionStatus{
					Type:               cond.Type,
					Status:             cond.Status,
					Reason:             cond.Reason,
					Message:            cond.Message,
					LastTransitionTime: cond.LastTransitionTime,
				})
			}

			hasCrashLoop := false
			hasImagePull := false
			allReady := true

			for _, cs := range pod.Status.ContainerStatuses {
				cStat := ContainerStatus{
					Name:         cs.Name,
					Image:        cs.Image,
					RestartCount: cs.RestartCount,
					Ready:        cs.Ready,
				}

				if !cs.Ready {
					allReady = false
				}

				if cs.State.Waiting != nil {
					cStat.State = "waiting"
					cStat.WaitingReason = cs.State.Waiting.Reason
					cStat.WaitingMessage = cs.State.Waiting.Message
					if cs.State.Waiting.Reason == "CrashLoopBackOff" {
						hasCrashLoop = true
					}
					if cs.State.Waiting.Reason == "ImagePullBackOff" || cs.State.Waiting.Reason == "ErrImagePull" {
						hasImagePull = true
					}
				} else if cs.State.Running != nil {
					cStat.State = "running"
				} else if cs.State.Terminated != nil {
					cStat.State = "terminated"
					cStat.TerminationReason = cs.State.Terminated.Reason
					cStat.ExitCode = cs.State.Terminated.ExitCode
				}

				containers = append(containers, cStat)
			}

			health := "HEALTHY"
			if hasCrashLoop || hasImagePull || pod.Status.Phase == "Failed" {
				health = "CRITICAL"
			} else if !allReady || pod.Status.Phase == "Pending" {
				health = "WARNING"
			}

			createdTs := time.Now().UnixMilli()
			if pod.Metadata.CreationTimestamp != "" {
				if t, err := time.Parse(time.RFC3339, pod.Metadata.CreationTimestamp); err == nil {
					createdTs = t.UnixMilli()
				}
			}

			podEvents := eventsMap[fmt.Sprintf("Pod/%s/%s", pod.Metadata.Namespace, pod.Metadata.Name)]

			c.RecordObservation(ResourceObservation{
				Kind:      "Pod",
				Namespace: pod.Metadata.Namespace,
				Name:      pod.Metadata.Name,
				Status:    pod.Status.Phase,
				Health:    health,
				CreatedAt: createdTs,
				UpdatedAt: time.Now().UnixMilli(),
				SpecSummary: map[string]interface{}{
					"nodeName": pod.Spec.NodeName,
				},
				StatusSummary: map[string]interface{}{
					"podIP":  pod.Status.PodIP,
					"hostIP": pod.Status.HostIP,
					"phase":  pod.Status.Phase,
				},
				Containers: containers,
				Conditions: conditions,
				Events:     podEvents,
			})
		}
	}
}

func (c *Collector) flushQueue(ctx context.Context) {
	items := c.queue.PopAll()
	if len(items) == 0 {
		return
	}

	payload := map[string]interface{}{
		"clusterId": c.cfg.ClusterID,
		"timestamp": time.Now().UnixMilli(),
		"items":     items,
	}

	if err := c.client.SendTelemetry(ctx, payload); err != nil {
		slog.Warn("Failed to dispatch telemetry batch", "error", err, "itemCount", len(items))
	} else {
		slog.Debug("Dispatched telemetry batch", "itemCount", len(items))
	}
}
