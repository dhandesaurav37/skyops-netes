package collector

import (
	"context"
	"log/slog"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/queue"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

// ResourceObservation represents a monitored Kubernetes resource
type ResourceObservation struct {
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
	resources []ResourceObservation
}

func NewCollector(cfg *config.Config, client *transport.Client, q *queue.BoundedQueue) *Collector {
	return &Collector{
		cfg:       cfg,
		client:    client,
		queue:     q,
		resources: make([]ResourceObservation, 0),
	}
}

// Start begins the informer watch and periodic telemetry dispatcher
func (c *Collector) Start(ctx context.Context) {
	ticker := time.NewTicker(c.cfg.TelemetryInterval)
	defer ticker.Stop()

	slog.Info("Kubernetes resource collector started", "interval", c.cfg.TelemetryInterval.String())

	for {
		select {
		case <-ctx.Done():
			slog.Info("Resource collector shutting down")
			return
		case <-ticker.C:
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
