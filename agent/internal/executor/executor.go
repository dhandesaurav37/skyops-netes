package executor

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/skyops-io/skyops/agent/internal/collector"
	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

// Executor periodically checks for approved structured remediation commands and executes them safely
type Executor struct {
	cfg       *config.Config
	transport *transport.Client
	k8sClient *collector.InClusterK8sClient
	interval  time.Duration
}

// NewExecutor creates a new remediation executor service
func NewExecutor(cfg *config.Config, transport *transport.Client, k8sClient *collector.InClusterK8sClient) *Executor {
	return &Executor{
		cfg:       cfg,
		transport: transport,
		k8sClient: k8sClient,
		interval:  10 * time.Second,
	}
}

// Start begins polling for approved actions and executing them
func (e *Executor) Start(ctx context.Context) {
	slog.Info("Remediation execution loop started", "pollInterval", e.interval.String())
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("Remediation execution loop stopped")
			return
		case <-ticker.C:
			e.pollAndExecute(ctx)
		}
	}
}

func (e *Executor) pollAndExecute(ctx context.Context) {
	actions, err := e.transport.FetchPendingActions(ctx)
	if err != nil {
		slog.Debug("Pending actions check notice", "error", err.Error())
		return
	}

	for _, action := range actions {
		slog.Info("Discovered approved remediation action",
			"actionId", action.ID,
			"incidentId", action.IncidentID,
			"actionType", action.ActionType,
			"resource", fmt.Sprintf("%s/%s", action.TargetResource.Kind, action.TargetResource.Name),
			"proposedImage", action.Parameters.ProposedImage,
		)

		if e.k8sClient == nil {
			slog.Warn("Skipping execution: in-cluster Kubernetes client unavailable in simulated environment")
			_ = e.transport.SendActionResult(ctx, action.ID, transport.ActionResultPayload{
				Status:  "SUCCESS",
				Message: fmt.Sprintf("Simulated in-cluster agent applied image patch: %s -> %s", action.Parameters.CurrentImage, action.Parameters.ProposedImage),
				AppliedChanges: map[string]interface{}{
					"container": action.Parameters.ContainerName,
					"image":     action.Parameters.ProposedImage,
				},
				AgentVersion: e.cfg.AgentVersion,
			})
			continue
		}

		// Execute typed patch deterministically
		var execErr error
		if action.ActionType == "UPDATE_CONTAINER_IMAGE" || action.ActionType == "REVERT_TAG" {
			execErr = e.k8sClient.UpdateWorkloadImage(
				ctx,
				action.TargetResource.Kind,
				action.TargetResource.Namespace,
				action.TargetResource.Name,
				action.Parameters.ContainerName,
				action.Parameters.ProposedImage,
			)
		} else {
			execErr = fmt.Errorf("unsupported action type: %s", action.ActionType)
		}

		if execErr != nil {
			slog.Error("Failed to apply Kubernetes remediation patch", "actionId", action.ID, "error", execErr)
			_ = e.transport.SendActionResult(ctx, action.ID, transport.ActionResultPayload{
				Status:       "FAILED",
				Message:      fmt.Sprintf("Kubernetes API error: %v", execErr),
				AgentVersion: e.cfg.AgentVersion,
			})
		} else {
			slog.Info("Successfully applied Kubernetes remediation patch", "actionId", action.ID)
			_ = e.transport.SendActionResult(ctx, action.ID, transport.ActionResultPayload{
				Status:  "SUCCESS",
				Message: fmt.Sprintf("Applied Strategic Merge Patch to update container %s image to %s", action.Parameters.ContainerName, action.Parameters.ProposedImage),
				AppliedChanges: map[string]interface{}{
					"container": action.Parameters.ContainerName,
					"image":     action.Parameters.ProposedImage,
				},
				AgentVersion: e.cfg.AgentVersion,
			})
		}
	}
}
