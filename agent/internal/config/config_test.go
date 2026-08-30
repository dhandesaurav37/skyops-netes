package config_test

import (
	"os"
	"testing"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
)

func TestLoadFromEnv_Success(t *testing.T) {
	os.Setenv("SKYOPS_CLUSTER_ID", "cls-test-123")
	os.Setenv("SKYOPS_AGENT_TOKEN", "agt-token-secret")
	os.Setenv("SKYOPS_SERVER_URL", "https://skyops.acme.corp")
	defer func() {
		os.Unsetenv("SKYOPS_CLUSTER_ID")
		os.Unsetenv("SKYOPS_AGENT_TOKEN")
		os.Unsetenv("SKYOPS_SERVER_URL")
	}()

	cfg, err := config.LoadFromEnv()
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if cfg.ClusterID != "cls-test-123" {
		t.Errorf("expected ClusterID 'cls-test-123', got '%s'", cfg.ClusterID)
	}

	if cfg.AgentToken != "agt-token-secret" {
		t.Errorf("expected AgentToken 'agt-token-secret', got '%s'", cfg.AgentToken)
	}

	if cfg.ServerURL != "https://skyops.acme.corp" {
		t.Errorf("expected ServerURL 'https://skyops.acme.corp', got '%s'", cfg.ServerURL)
	}

	if cfg.HeartbeatInterval != 30*time.Second {
		t.Errorf("expected HeartbeatInterval 30s, got %v", cfg.HeartbeatInterval)
	}
}

func TestLoadFromEnv_MissingClusterID(t *testing.T) {
	os.Unsetenv("SKYOPS_CLUSTER_ID")
	os.Setenv("SKYOPS_AGENT_TOKEN", "agt-token-secret")
	defer os.Unsetenv("SKYOPS_AGENT_TOKEN")

	_, err := config.LoadFromEnv()
	if err == nil {
		t.Fatal("expected error for missing SKYOPS_CLUSTER_ID, got nil")
	}
}

func TestLoadFromEnv_MissingToken(t *testing.T) {
	os.Setenv("SKYOPS_CLUSTER_ID", "cls-test-123")
	os.Unsetenv("SKYOPS_AGENT_TOKEN")
	defer os.Unsetenv("SKYOPS_CLUSTER_ID")

	_, err := config.LoadFromEnv()
	if err == nil {
		t.Fatal("expected error for missing SKYOPS_AGENT_TOKEN, got nil")
	}
}

func TestLoadFromEnv_MissingServerURL(t *testing.T) {
	os.Setenv("SKYOPS_CLUSTER_ID", "cls-test-123")
	os.Setenv("SKYOPS_AGENT_TOKEN", "agt-token-secret")
	os.Unsetenv("SKYOPS_SERVER_URL")
	defer os.Unsetenv("SKYOPS_CLUSTER_ID")
	defer os.Unsetenv("SKYOPS_AGENT_TOKEN")
	if _, err := config.LoadFromEnv(); err == nil {
		t.Fatal("expected error for missing SKYOPS_SERVER_URL, got nil")
	}
}
