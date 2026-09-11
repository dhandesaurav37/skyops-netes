package config

import (
	"errors"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds runtime configuration for the SkyOps Kubernetes Agent
type Config struct {
	ClusterID          string
	AgentToken         string
	ServerURL          string
	AgentVersion       string
	HeartbeatInterval  time.Duration
	TelemetryInterval  time.Duration
	QueueCapacity      int
	MaxRetries         int
	BackoffBase        time.Duration
	ActionPollInterval time.Duration
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
		return nil, errors.New("missing required environment variable: SKYOPS_SERVER_URL")
	}
	parsedURL, err := url.Parse(serverURL)
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return nil, errors.New("SKYOPS_SERVER_URL must be an absolute HTTP(S) URL")
	}
	serverURL = strings.TrimRight(serverURL, "/")

	agentVersion := os.Getenv("SKYOPS_AGENT_VERSION")
	if agentVersion == "" {
		agentVersion = "v1.5.0"
	}

	telemetryInterval := durationEnv("SKYOPS_TELEMETRY_INTERVAL", 15*time.Second)
	heartbeatInterval := durationEnv("SKYOPS_HEARTBEAT_INTERVAL", 30*time.Second)
	return &Config{
		ClusterID:         clusterID,
		AgentToken:        agentToken,
		ServerURL:         serverURL,
		AgentVersion:      agentVersion,
		HeartbeatInterval: heartbeatInterval, TelemetryInterval: telemetryInterval, ActionPollInterval: durationEnv("SKYOPS_ACTION_POLL_INTERVAL", 5*time.Second),
		QueueCapacity: positiveIntEnv("SKYOPS_QUEUE_CAPACITY", 500), MaxRetries: positiveIntEnv("SKYOPS_MAX_RETRIES", 5), BackoffBase: durationEnv("SKYOPS_BACKOFF_BASE", time.Second),
	}, nil
}

func durationEnv(name string, fallback time.Duration) time.Duration {
	if v, err := time.ParseDuration(os.Getenv(name)); err == nil && v > 0 {
		return v
	}
	return fallback
}
func positiveIntEnv(name string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(name)); err == nil && v > 0 {
		return v
	}
	return fallback
}
