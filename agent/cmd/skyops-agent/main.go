package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/skyops-io/skyops/agent/internal/collector"
	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/heartbeat"
	"github.com/skyops-io/skyops/agent/internal/queue"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

func main() {
	// Initialize structured logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("Starting SkyOps Kubernetes Agent", "version", "v1.4.2")

	// Load configuration
	cfg, err := config.LoadFromEnv()
	if err != nil {
		slog.Error("Configuration failure", "error", err)
		fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}

	slog.Info("Configuration loaded successfully",
		"clusterId", cfg.ClusterID,
		"serverUrl", cfg.ServerURL,
		"heartbeatInterval", cfg.HeartbeatInterval.String(),
	)

	// Set up root context with signal cancellation
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer cancel()

	// Initialize components
	telemetryQueue := queue.NewBoundedQueue(cfg.QueueCapacity)
	transportClient := transport.NewClient(cfg)
	heartbeatService := heartbeat.NewService(cfg, transportClient)
	resourceCollector := collector.NewCollector(cfg, transportClient, telemetryQueue)

	// Start background routines
	go heartbeatService.Start(ctx)
	go resourceCollector.Start(ctx)

	slog.Info("SkyOps Agent running in active observation mode")

	// Wait for shutdown signal
	<-ctx.Done()
	slog.Info("Shutdown signal received, draining queues and gracefully terminating...")

	// 5-second graceful drain timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	<-shutdownCtx.Done()
	slog.Info("SkyOps Agent successfully exited")
}
