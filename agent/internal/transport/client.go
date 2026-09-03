package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
)

// Client handles secure authenticated communication with the SkyOps backend API
type Client struct {
	cfg        *config.Config
	httpClient *http.Client
}

func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// RegistrationPayload schema matching SkyOps Agent Register API
type RegistrationPayload struct {
	AgentVersion string `json:"agentVersion"`
	K8sVersion   string `json:"k8sVersion"`
}

// RegistrationResponse schema returned upon registration
type RegistrationResponse struct {
	Status         string `json:"status"`
	ClusterID      string `json:"clusterId"`
	ConnectionCode string `json:"connectionCode,omitempty"`
	ServerTime     int64  `json:"serverTime"`
}

// RegisterAgent registers the agent on startup and retrieves initial cluster handshake details
func (c *Client) RegisterAgent(ctx context.Context, payload RegistrationPayload) (*RegistrationResponse, error) {
	url := fmt.Sprintf("%s/api/v1/agent/register", c.cfg.ServerURL)
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal registration payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.cfg.AgentToken))
	req.Header.Set("User-Agent", fmt.Sprintf("SkyOpsAgent/%s", c.cfg.AgentVersion))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("registration returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var regResp RegistrationResponse
	if err := json.NewDecoder(resp.Body).Decode(&regResp); err != nil {
		return nil, fmt.Errorf("failed to decode registration response: %w", err)
	}

	return &regResp, nil
}

// HeartbeatPayload schema matching SkyOps Ingestion API
type HeartbeatPayload struct {
	ClusterID    string `json:"clusterId"`
	AgentVersion string `json:"agentVersion"`
	K8sVersion   string `json:"k8sVersion"`
	NodeCount    int    `json:"nodeCount"`
	PodCount     int    `json:"podCount"`
	Timestamp    int64  `json:"timestamp"`
}

// SendHeartbeat sends a periodic heartbeat with exponential retry backoff
func (c *Client) SendHeartbeat(ctx context.Context, payload HeartbeatPayload) error {
	url := fmt.Sprintf("%s/api/v1/agent/heartbeat", c.cfg.ServerURL)
	return c.postWithRetry(ctx, url, payload)
}

// SendTelemetry dispatches observed Kubernetes resources & events
func (c *Client) SendTelemetry(ctx context.Context, payload interface{}) error {
	url := fmt.Sprintf("%s/api/v1/agent/telemetry", c.cfg.ServerURL)
	return c.postWithRetry(ctx, url, payload)
}

// AgentAction represents an approved, structured remediation command from SkyOps platform
type AgentAction struct {
	ID             string `json:"id"`
	IncidentID     string `json:"incidentId"`
	ActionType     string `json:"actionType"`
	TargetResource struct {
		Kind      string `json:"kind"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
	} `json:"targetResource"`
	Parameters struct {
		ContainerName string `json:"containerName"`
		CurrentImage  string `json:"currentImage"`
		ProposedImage string `json:"proposedImage"`
	} `json:"parameters"`
	Status string `json:"status"`
}

type PendingActionsResponse struct {
	Status    string        `json:"status"`
	ClusterID string        `json:"clusterId"`
	Actions   []AgentAction `json:"actions"`
}

type ActionResultPayload struct {
	Status         string                 `json:"status"`
	Message        string                 `json:"message,omitempty"`
	AppliedChanges map[string]interface{} `json:"appliedChanges,omitempty"`
	AgentVersion   string                 `json:"agentVersion,omitempty"`
}

// FetchPendingActions queries the SkyOps server for approved remediation commands
func (c *Client) FetchPendingActions(ctx context.Context) ([]AgentAction, error) {
	url := fmt.Sprintf("%s/api/v1/agent/actions", c.cfg.ServerURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.cfg.AgentToken))
	req.Header.Set("User-Agent", fmt.Sprintf("SkyOpsAgent/%s", c.cfg.AgentVersion))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("actions API returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var res PendingActionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}
	return res.Actions, nil
}

// SendActionResult reports the result of executing an approved remediation back to the server
func (c *Client) SendActionResult(ctx context.Context, actionID string, payload ActionResultPayload) error {
	url := fmt.Sprintf("%s/api/v1/agent/actions/%s/result", c.cfg.ServerURL, actionID)
	return c.postWithRetry(ctx, url, payload)
}

func (c *Client) postWithRetry(ctx context.Context, url string, payload interface{}) error {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= c.cfg.MaxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
		if err != nil {
			return err
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.cfg.AgentToken))
		req.Header.Set("User-Agent", fmt.Sprintf("SkyOpsAgent/%s", c.cfg.AgentVersion))

		resp, err := c.httpClient.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil // Success
			}
			body, _ := io.ReadAll(resp.Body)
			lastErr = fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(body))
		} else {
			lastErr = err
		}

		// Calculate exponential backoff with jitter
		backoff := time.Duration(1<<attempt)*c.cfg.BackoffBase + time.Duration(rand.Intn(500))*time.Millisecond
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
	}

	return fmt.Errorf("exhausted %d retries: %w", c.cfg.MaxRetries, lastErr)
}
