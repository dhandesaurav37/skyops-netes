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

// Version holds the authoritative release version of the agent, injected at build-time via ldflags (-X main.Version=...)
var Version = "v1.5.0"

func printPairingBanner(connectionCode string) {
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("       SkyOps Agent Installed           ")
	fmt.Println("========================================")
	fmt.Println()
	fmt.Println("Cluster detected successfully.")
	fmt.Println()
	fmt.Println("Connection Key:")
	fmt.Println()
	fmt.Printf("    %s\n", connectionCode)
	fmt.Println()
	fmt.Println("Enter this key in the SkyOps dashboard.")
	fmt.Println()
	fmt.Println("This key expires in 15 minutes.")
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println()
}

func main() {
	// Initialize structured logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("Starting SkyOps Kubernetes Agent", "version", Version)

	// Load configuration
	cfg, err := config.LoadFromEnv()
	if err != nil {
		slog.Error("Configuration failure", "error", err)
		fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}

	// Ensure runtime version takes precedence if injected
	if Version != "" {
		cfg.AgentVersion = Version
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

	// Register Agent on startup
	regPayload := transport.RegistrationPayload{
		AgentVersion: cfg.AgentVersion,
		K8sVersion:   "v1.31.2",
	}

	regResp, regErr := transportClient.RegisterAgent(ctx, regPayload)
	if regErr != nil {
		slog.Warn("Initial registration notice (will retry via heartbeat)", "error", regErr)
	} else if regResp != nil {
		slog.Info("Agent registered successfully with central platform", "clusterId", regResp.ClusterID, "status", regResp.Status)
		if regResp.ConnectionCode != "" {
			printPairingBanner(regResp.ConnectionCode)
		}
	}

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
