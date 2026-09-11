package heartbeat

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

// Service periodically pulses health heartbeats to SkyOps
type Service struct {
	cfg        *config.Config
	client     *transport.Client
	mu         sync.RWMutex
	nodeCount  int
	podCount   int
	k8sVersion string
}

func NewService(cfg *config.Config, client *transport.Client) *Service {
	return &Service{
		cfg:        cfg,
		client:     client,
		nodeCount:  0,
		podCount:   0,
		k8sVersion: "",
	}
}

func (s *Service) UpdateCounts(nodes, pods int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nodeCount = nodes
	s.podCount = pods
}

func (s *Service) UpdateTelemetryState(nodes, pods int, k8sVersion string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nodeCount = nodes
	s.podCount = pods
	if k8sVersion != "" {
		s.k8sVersion = k8sVersion
	}
}

func (s *Service) SetK8sVersion(ver string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ver != "" {
		s.k8sVersion = ver
	}
}

func (s *Service) Start(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.HeartbeatInterval)
	defer ticker.Stop()

	slog.Info("Heartbeat service started", "interval", s.cfg.HeartbeatInterval.String())

	// Send initial immediate heartbeat
	s.send(ctx)

	for {
		select {
		case <-ctx.Done():
			slog.Info("Heartbeat service stopping")
			return
		case <-ticker.C:
			s.send(ctx)
		}
	}
}

func (s *Service) send(ctx context.Context) {
	s.mu.RLock()
	nodes := s.nodeCount
	pods := s.podCount
	k8sVer := s.k8sVersion
	s.mu.RUnlock()

	payload := transport.HeartbeatPayload{
		ClusterID:    s.cfg.ClusterID,
		AgentVersion: s.cfg.AgentVersion,
		K8sVersion:   k8sVer,
		NodeCount:    nodes,
		PodCount:     pods,
		Timestamp:    time.Now().UnixMilli(),
	}

	if err := s.client.SendHeartbeat(ctx, payload); err != nil {
		slog.Warn("Heartbeat dispatch failed", "error", err)
	} else {
		slog.Debug("Heartbeat sent successfully", "clusterId", s.cfg.ClusterID, "nodes", nodes, "pods", pods, "k8sVersion", k8sVer)
	}
}

