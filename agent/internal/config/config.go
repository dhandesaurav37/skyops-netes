package config

import (
	"errors"
	"os"
	"time"
)

// Config holds runtime configuration for the SkyOps Kubernetes Agent
type Config struct {
	ClusterID         string
	AgentToken        string
	ServerURL         string
	AgentVersion      string
	HeartbeatInterval time.Duration
	TelemetryInterval time.Duration
	QueueCapacity     int
	MaxRetries        int
	BackoffBase       time.Duration
}

// LoadFromEnv loads configuration from environment variables with defaults
func LoadFromEnv() (*Config, error) {
	clusterID := os.Getenv("SKYOPS_CLUSTER_ID")
	if clusterID == "" {
		return nil, errors.New("missing required environment variable: SKYOPS_CLUSTER_ID")
	}

	agentToken := os.Getenv("SKYOPS_AGENT_TOKEN")
	if agentToken == "" {
		return nil, errors.New("missing required environment variable: SKYOPS_AGENT_TOKEN")
	}

	serverURL := os.Getenv("SKYOPS_SERVER_URL")
	if serverURL == "" {
		serverURL = "https://skyops.acme.corp"
	}

	return &Config{
		ClusterID:         clusterID,
		AgentToken:        agentToken,
		ServerURL:         serverURL,
		AgentVersion:      "v1.4.2",
		HeartbeatInterval: 30 * time.Second,
		TelemetryInterval: 15 * time.Second,
		QueueCapacity:     500,
		MaxRetries:        5,
		BackoffBase:       1 * time.Second,
	}, nil
}
