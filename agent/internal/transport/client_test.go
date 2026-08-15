package transport_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

func TestClient_SendHeartbeat(t *testing.T) {
	receivedAuth := ""
	var receivedPayload transport.HeartbeatPayload

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agent/heartbeat" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		receivedAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&receivedPayload); err != nil {
			t.Errorf("failed to decode body: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success": true}`))
	}))
	defer server.Close()

	cfg := &config.Config{
		ClusterID:         "cls-prod-test",
		AgentToken:        "secret-token-xyz",
		ServerURL:         server.URL,
		AgentVersion:      "v1.4.2",
		HeartbeatInterval: 10 * time.Second,
		MaxRetries:        1,
		BackoffBase:       10 * time.Millisecond,
	}

	client := transport.NewClient(cfg)

	payload := transport.HeartbeatPayload{
		ClusterID:    "cls-prod-test",
		AgentVersion: "v1.4.2",
		K8sVersion:   "v1.31.2",
		NodeCount:    3,
		PodCount:     24,
		Timestamp:    time.Now().UnixMilli(),
	}

	err := client.SendHeartbeat(context.Background(), payload)
	if err != nil {
		t.Fatalf("expected SendHeartbeat to succeed, got: %v", err)
	}

	if receivedAuth != "Bearer secret-token-xyz" {
		t.Errorf("expected Authorization header 'Bearer secret-token-xyz', got '%s'", receivedAuth)
	}

	if receivedPayload.ClusterID != "cls-prod-test" || receivedPayload.PodCount != 24 {
		t.Errorf("unexpected decoded payload: %+v", receivedPayload)
	}
}
