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

// StateUpdater receives live telemetry updates (node count, pod count, live K8s version)
type StateUpdater interface {
	UpdateTelemetryState(nodes, pods int, k8sVersion string)
}

type Collector struct {
	cfg          *config.Config
	client       *transport.Client
	queue        *queue.BoundedQueue
	k8sClient    *InClusterK8sClient
	stateUpdater StateUpdater
}

func NewCollector(cfg *config.Config, client *transport.Client, q *queue.BoundedQueue, kClient *InClusterK8sClient) *Collector {
	if kClient == nil {
		var err error
		kClient, err = NewInClusterK8sClient()
		if err != nil {
			slog.Warn("Running in standalone observation mode (in-cluster K8s API client disabled)", "reason", err.Error())
		} else {
			slog.Info("Successfully initialized Kubernetes in-cluster API client")
		}
	}

	return &Collector{
		cfg:       cfg,
		client:    client,
		queue:     q,
		k8sClient: kClient,
	}
}

func (c *Collector) SetStateUpdater(updater StateUpdater) {
	c.stateUpdater = updater
}

// Start begins the scrape loop and periodic telemetry dispatcher
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

// collectFromKubernetes polls Kubernetes API endpoints for Nodes, Pods, Deployments, StatefulSets, DaemonSets, PVCs and Events
func (c *Collector) collectFromKubernetes(ctx context.Context) {
	if c.k8sClient == nil {
		return
	}

	// 1. Fetch Events first to correlate with pods, nodes, and workloads
	eventsMap, totalEvents := c.collectEvents(ctx)

	// 2. Fetch Nodes
	nodeObservations, detectedK8sVer := c.collectNodes(ctx, eventsMap)
	for _, obs := range nodeObservations {
		c.RecordObservation(obs)
	}

	// 3. Fetch Pods
	podObservations := c.collectPods(ctx, eventsMap)
	for _, obs := range podObservations {
		c.RecordObservation(obs)
	}

	// 4. Fetch Deployments
	deploymentObservations := c.collectDeployments(ctx, eventsMap)
	for _, obs := range deploymentObservations {
		c.RecordObservation(obs)
	}

	// 5. Fetch StatefulSets
	statefulSetObservations := c.collectStatefulSets(ctx, eventsMap)
	for _, obs := range statefulSetObservations {
		c.RecordObservation(obs)
	}

	// 6. Fetch DaemonSets
	daemonSetObservations := c.collectDaemonSets(ctx, eventsMap)
	for _, obs := range daemonSetObservations {
		c.RecordObservation(obs)
	}

	// 7. Fetch PVCs
	pvcObservations := c.collectPVCs(ctx, eventsMap)
	for _, obs := range pvcObservations {
		c.RecordObservation(obs)
	}

	nodeCount := len(nodeObservations)
	podCount := len(podObservations)

	// Update heartbeat state if registered
	if c.stateUpdater != nil {
		c.stateUpdater.UpdateTelemetryState(nodeCount, podCount, detectedK8sVer)
	}

	slog.Info("Kubernetes telemetry collected",
		"nodes", nodeCount,
		"pods", podCount,
		"deployments", len(deploymentObservations),
		"statefulsets", len(statefulSetObservations),
		"daemonsets", len(daemonSetObservations),
		"pvcs", len(pvcObservations),
		"events", totalEvents,
		"k8sVersion", detectedK8sVer,
	)
}

func (c *Collector) collectEvents(ctx context.Context) (map[string][]EventObservation, int) {
	eventsMap := make(map[string][]EventObservation)
	var eventList K8sEventList
	if err := c.k8sClient.GetJSON(ctx, "/api/v1/events?limit=300", &eventList); err != nil {
		slog.Debug("Event collection notice", "error", err)
		return eventsMap, 0
	}

	for _, evt := range eventList.Items {
		key := fmt.Sprintf("%s/%s/%s", evt.InvolvedObject.Kind, evt.InvolvedObject.Namespace, evt.InvolvedObject.Name)
		ts := time.Now().UnixMilli()
		if evt.LastTimestamp != "" {
			if t, err := time.Parse(time.RFC3339, evt.LastTimestamp); err == nil {
				ts = t.UnixMilli()
			}
		} else if evt.EventTime != "" {
			if t, err := time.Parse(time.RFC3339, evt.EventTime); err == nil {
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

	return eventsMap, len(eventList.Items)
}

func (c *Collector) collectNodes(ctx context.Context, eventsMap map[string][]EventObservation) ([]ResourceObservation, string) {
	var results []ResourceObservation
	var detectedK8sVer string

	var nodeList K8sNodeList
	if err := c.k8sClient.GetJSON(ctx, "/api/v1/nodes", &nodeList); err != nil {
		slog.Warn("Failed to list Kubernetes nodes", "error", err)
		return results, detectedK8sVer
	}

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

		if node.Status.NodeInfo.KubeletVersion != "" && detectedK8sVer == "" {
			detectedK8sVer = node.Status.NodeInfo.KubeletVersion
		}

		nodeEvents := eventsMap[fmt.Sprintf("Node//%s", node.Metadata.Name)]

		results = append(results, ResourceObservation{
			ID:        node.Metadata.UID,
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

	if detectedK8sVer == "" && c.k8sClient != nil {
		if ver, err := c.k8sClient.GetServerVersion(ctx); err == nil && ver != "" {
			detectedK8sVer = ver
		}
	}

	return results, detectedK8sVer
}

func (c *Collector) collectPods(ctx context.Context, eventsMap map[string][]EventObservation) []ResourceObservation {
	var results []ResourceObservation

	var podList K8sPodList
	if err := c.k8sClient.GetJSON(ctx, "/api/v1/pods", &podList); err != nil {
		slog.Warn("Failed to list Kubernetes pods", "error", err)
		return results
	}

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

		results = append(results, ResourceObservation{
			ID:        pod.Metadata.UID,
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

	return results
}

func (c *Collector) collectDeployments(ctx context.Context, eventsMap map[string][]EventObservation) []ResourceObservation {
	var results []ResourceObservation

	var depList K8sDeploymentList
	if err := c.k8sClient.GetJSON(ctx, "/apis/apps/v1/deployments", &depList); err != nil {
		slog.Debug("Deployments scrape notice", "error", err)
		return results
	}

	for _, dep := range depList.Items {
		conditions := make([]ConditionStatus, 0)
		for _, cond := range dep.Status.Conditions {
			conditions = append(conditions, ConditionStatus{
				Type:               cond.Type,
				Status:             cond.Status,
				Reason:             cond.Reason,
				Message:            cond.Message,
				LastTransitionTime: cond.LastTransitionTime,
			})
		}

		health := "HEALTHY"
		status := fmt.Sprintf("%d/%d Ready", dep.Status.ReadyReplicas, dep.Spec.Replicas)
		if dep.Status.ReadyReplicas < dep.Spec.Replicas {
			if dep.Status.ReadyReplicas == 0 && dep.Spec.Replicas > 0 {
				health = "CRITICAL"
			} else {
				health = "WARNING"
			}
		}

		createdTs := time.Now().UnixMilli()
		if dep.Metadata.CreationTimestamp != "" {
			if t, err := time.Parse(time.RFC3339, dep.Metadata.CreationTimestamp); err == nil {
				createdTs = t.UnixMilli()
			}
		}

		depEvents := eventsMap[fmt.Sprintf("Deployment/%s/%s", dep.Metadata.Namespace, dep.Metadata.Name)]

		results = append(results, ResourceObservation{
			ID:        dep.Metadata.UID,
			Kind:      "Deployment",
			Namespace: dep.Metadata.Namespace,
			Name:      dep.Metadata.Name,
			Status:    status,
			Health:    health,
			CreatedAt: createdTs,
			UpdatedAt: time.Now().UnixMilli(),
			SpecSummary: map[string]interface{}{
				"replicas": dep.Spec.Replicas,
			},
			StatusSummary: map[string]interface{}{
				"replicas":            dep.Status.Replicas,
				"readyReplicas":       dep.Status.ReadyReplicas,
				"availableReplicas":   dep.Status.AvailableReplicas,
				"updatedReplicas":     dep.Status.UpdatedReplicas,
				"unavailableReplicas": dep.Status.UnavailableReplicas,
			},
			Conditions: conditions,
			Events:     depEvents,
		})
	}

	return results
}

func (c *Collector) collectStatefulSets(ctx context.Context, eventsMap map[string][]EventObservation) []ResourceObservation {
	var results []ResourceObservation

	var ssList K8sStatefulSetList
	if err := c.k8sClient.GetJSON(ctx, "/apis/apps/v1/statefulsets", &ssList); err != nil {
		slog.Debug("StatefulSets scrape notice", "error", err)
		return results
	}

	for _, ss := range ssList.Items {
		health := "HEALTHY"
		status := fmt.Sprintf("%d/%d Ready", ss.Status.ReadyReplicas, ss.Spec.Replicas)
		if ss.Status.ReadyReplicas < ss.Spec.Replicas {
			if ss.Status.ReadyReplicas == 0 && ss.Spec.Replicas > 0 {
				health = "CRITICAL"
			} else {
				health = "WARNING"
			}
		}

		createdTs := time.Now().UnixMilli()
		if ss.Metadata.CreationTimestamp != "" {
			if t, err := time.Parse(time.RFC3339, ss.Metadata.CreationTimestamp); err == nil {
				createdTs = t.UnixMilli()
			}
		}

		ssEvents := eventsMap[fmt.Sprintf("StatefulSet/%s/%s", ss.Metadata.Namespace, ss.Metadata.Name)]

		results = append(results, ResourceObservation{
			ID:        ss.Metadata.UID,
			Kind:      "StatefulSet",
			Namespace: ss.Metadata.Namespace,
			Name:      ss.Metadata.Name,
			Status:    status,
			Health:    health,
			CreatedAt: createdTs,
			UpdatedAt: time.Now().UnixMilli(),
			SpecSummary: map[string]interface{}{
				"replicas": ss.Spec.Replicas,
			},
			StatusSummary: map[string]interface{}{
				"replicas":        ss.Status.Replicas,
				"readyReplicas":   ss.Status.ReadyReplicas,
				"currentReplicas": ss.Status.CurrentReplicas,
				"updatedReplicas": ss.Status.UpdatedReplicas,
			},
			Events: ssEvents,
		})
	}

	return results
}

func (c *Collector) collectDaemonSets(ctx context.Context, eventsMap map[string][]EventObservation) []ResourceObservation {
	var results []ResourceObservation

	var dsList K8sDaemonSetList
	if err := c.k8sClient.GetJSON(ctx, "/apis/apps/v1/daemonsets", &dsList); err != nil {
		slog.Debug("DaemonSets scrape notice", "error", err)
		return results
	}

	for _, ds := range dsList.Items {
		health := "HEALTHY"
		status := fmt.Sprintf("%d/%d Ready", ds.Status.NumberReady, ds.Status.DesiredNumberScheduled)
		if ds.Status.NumberReady < ds.Status.DesiredNumberScheduled {
			if ds.Status.NumberReady == 0 && ds.Status.DesiredNumberScheduled > 0 {
				health = "CRITICAL"
			} else {
				health = "WARNING"
			}
		}

		createdTs := time.Now().UnixMilli()
		if ds.Metadata.CreationTimestamp != "" {
			if t, err := time.Parse(time.RFC3339, ds.Metadata.CreationTimestamp); err == nil {
				createdTs = t.UnixMilli()
			}
		}

		dsEvents := eventsMap[fmt.Sprintf("DaemonSet/%s/%s", ds.Metadata.Namespace, ds.Metadata.Name)]

		results = append(results, ResourceObservation{
			ID:        ds.Metadata.UID,
			Kind:      "DaemonSet",
			Namespace: ds.Metadata.Namespace,
			Name:      ds.Metadata.Name,
			Status:    status,
			Health:    health,
			CreatedAt: createdTs,
			UpdatedAt: time.Now().UnixMilli(),
			SpecSummary: map[string]interface{}{
				"desiredNumberScheduled": ds.Status.DesiredNumberScheduled,
			},
			StatusSummary: map[string]interface{}{
				"currentNumberScheduled": ds.Status.CurrentNumberScheduled,
				"numberReady":            ds.Status.NumberReady,
				"numberAvailable":        ds.Status.NumberAvailable,
				"numberMisscheduled":     ds.Status.NumberMisscheduled,
			},
			Events: dsEvents,
		})
	}

	return results
}

func (c *Collector) collectPVCs(ctx context.Context, eventsMap map[string][]EventObservation) []ResourceObservation {
	var results []ResourceObservation

	var pvcList K8sPVCList
	if err := c.k8sClient.GetJSON(ctx, "/api/v1/persistentvolumeclaims", &pvcList); err != nil {
		slog.Debug("PVC scrape notice", "error", err)
		return results
	}

	for _, pvc := range pvcList.Items {
		health := "HEALTHY"
		if pvc.Status.Phase == "Lost" {
			health = "CRITICAL"
		} else if pvc.Status.Phase == "Pending" {
			health = "WARNING"
		}

		createdTs := time.Now().UnixMilli()
		if pvc.Metadata.CreationTimestamp != "" {
			if t, err := time.Parse(time.RFC3339, pvc.Metadata.CreationTimestamp); err == nil {
				createdTs = t.UnixMilli()
			}
		}

		pvcEvents := eventsMap[fmt.Sprintf("PersistentVolumeClaim/%s/%s", pvc.Metadata.Namespace, pvc.Metadata.Name)]

		results = append(results, ResourceObservation{
			ID:        pvc.Metadata.UID,
			Kind:      "PersistentVolumeClaim",
			Namespace: pvc.Metadata.Namespace,
			Name:      pvc.Metadata.Name,
			Status:    pvc.Status.Phase,
			Health:    health,
			CreatedAt: createdTs,
			UpdatedAt: time.Now().UnixMilli(),
			SpecSummary: map[string]interface{}{
				"storageClassName": pvc.Spec.StorageClassName,
				"volumeName":       pvc.Spec.VolumeName,
				"accessModes":      pvc.Spec.AccessModes,
				"requests":         pvc.Spec.Resources.Requests,
			},
			StatusSummary: map[string]interface{}{
				"phase":    pvc.Status.Phase,
				"capacity": pvc.Status.Capacity,
			},
			Events: pvcEvents,
		})
	}

	return results
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
		// The current collector only marks a snapshot complete after successful
		// collection support is available for every resource kind. This prevents
		// the server from mistaking a transient partial scrape for deletion.
		"snapshotComplete": false,
	}

	if err := c.client.SendTelemetry(ctx, payload); err != nil {
		c.queue.RequeueFront(items)
		slog.Warn("Failed to dispatch telemetry batch", "error", err, "itemCount", len(items))
	} else {
		slog.Info("Dispatched telemetry batch", "itemCount", len(items), "clusterId", c.cfg.ClusterID)
	}
}
