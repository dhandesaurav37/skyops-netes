package heartbeat

import (
	"context"
	"log/slog"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

// Service periodically pulses health heartbeats to SkyOps
type Service struct {
	cfg       *config.Config
	client    *transport.Client
	nodeCount int
	podCount  int
}

func NewService(cfg *config.Config, client *transport.Client) *Service {
	return &Service{
		cfg:       cfg,
		client:    client,
		nodeCount: 0,
		podCount:  0,
	}
}

func (s *Service) UpdateCounts(nodes, pods int) {
	s.nodeCount = nodes
	s.podCount = pods
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
	payload := transport.HeartbeatPayload{
		ClusterID:    s.cfg.ClusterID,
		AgentVersion: s.cfg.AgentVersion,
		K8sVersion:   "v1.31.2",
		NodeCount:    s.nodeCount,
		PodCount:     s.podCount,
		Timestamp:    time.Now().UnixMilli(),
	}

	if err := s.client.SendHeartbeat(ctx, payload); err != nil {
		slog.Warn("Heartbeat dispatch failed", "error", err)
	} else {
		slog.Debug("Heartbeat sent successfully", "clusterId", s.cfg.ClusterID)
	}
}
