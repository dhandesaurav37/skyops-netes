import {
  IncidentSeverity,
  IncidentType,
  KubernetesResource,
  TechnicalDetails
} from '../../src/types/index';

export interface DetectionResult {
  detected: boolean;
  incidentType: IncidentType;
  title: string;
  severity: IncidentSeverity;
  technicalDetails: TechnicalDetails;
}

export interface RecoveryResult {
  recovered: boolean;
  reason: string;
}

/**
 * Deterministic Incident Rule Engine
 * Evaluates observed Kubernetes resources and produces standardized diagnostic results without non-deterministic or LLM logic.
 */
export class IncidentDetector {
  /**
   * Evaluate a single resource observation
   */
  public static evaluateResource(resource: KubernetesResource): DetectionResult | null {
    switch (resource.kind) {
      case 'Pod':
        return this.evaluatePod(resource);
      case 'Node':
        return this.evaluateNode(resource);
      case 'Deployment':
        return this.evaluateDeployment(resource);
      case 'StatefulSet':
        return this.evaluateStatefulSet(resource);
      case 'DaemonSet':
        return this.evaluateDaemonSet(resource);
      case 'Job':
        return this.evaluateJob(resource);
      case 'PersistentVolumeClaim':
      case 'PVC':
        return this.evaluatePVC(resource);
      default:
        return null;
    }
  }

  /**
   * Pod Rule Evaluation
   */
  private static evaluatePod(resource: KubernetesResource): DetectionResult | null {
    const containers = resource.containers || [];
    const events = resource.events || [];

    // 1. Check for CrashLoopBackOff or Container Error
    for (const c of containers) {
      if (
        c.waitingReason === 'CrashLoopBackOff' ||
        (c.restartCount >= 1 && (c.state === 'waiting' || c.waitingReason === 'CrashLoopBackOff')) ||
        (c.terminationReason === 'Error' && c.exitCode !== undefined && c.exitCode !== 0) ||
        resource.status === 'CrashLoopBackOff' ||
        resource.status === 'Error'
      ) {
        return {
          detected: true,
          incidentType: 'CrashLoopBackOff',
          title: `Pod ${resource.name} is in CrashLoopBackOff (Container: ${c.name}, ${c.restartCount} restarts)`,
          severity: c.restartCount > 5 ? 'HIGH' : 'MEDIUM',
          technicalDetails: {
            podName: resource.name,
            containerName: c.name,
            image: c.image,
            restartCount: c.restartCount,
            exitCode: c.exitCode,
            reason: c.waitingReason || c.terminationReason || 'CrashLoopBackOff',
            message: c.waitingMessage || `Container ${c.name} is restarting repeatedly (exit code: ${c.exitCode ?? 'unknown'})`,
            nodeName: String(resource.specSummary?.nodeName || 'unknown'),
            containers,
            conditions: resource.conditions,
            events
          }
        };
      }
    }

    // 2. Check for ImagePullBackOff / ErrImagePull / Image errors
    for (const c of containers) {
      const isImageError =
        c.waitingReason === 'ImagePullBackOff' ||
        c.waitingReason === 'ErrImagePull' ||
        c.waitingReason === 'InvalidImageName' ||
        resource.status === 'ImagePullBackOff' ||
        resource.status === 'ErrImagePull' ||
        resource.status === 'InvalidImageName';

      if (isImageError) {
        return {
          detected: true,
          incidentType: 'ImagePullBackOff',
          title: `Image pull failure in pod ${resource.name} (${c.waitingReason || resource.status}: ${c.name})`,
          severity: 'HIGH',
          technicalDetails: {
            podName: resource.name,
            containerName: c.name,
            image: c.image,
            reason: c.waitingReason || resource.status || 'ImagePullBackOff',
            message: c.waitingMessage || `Failed to pull container image ${c.image}`,
            nodeName: String(resource.specSummary?.nodeName || 'unknown'),
            containers,
            conditions: resource.conditions,
            events
          }
        };
      }
    }

    // Fallback if containers list was empty but pod status itself indicates crash/image failure
    if (resource.status === 'ImagePullBackOff' || resource.status === 'ErrImagePull') {
      return {
        detected: true,
        incidentType: 'ImagePullBackOff',
        title: `Image pull failure in pod ${resource.name}`,
        severity: 'HIGH',
        technicalDetails: {
          podName: resource.name,
          reason: resource.status,
          message: `Pod ${resource.name} failed to pull container image`,
          nodeName: String(resource.specSummary?.nodeName || 'unknown'),
          containers,
          conditions: resource.conditions,
          events
        }
      };
    }

    if (resource.status === 'CrashLoopBackOff' || resource.status === 'Error') {
      return {
        detected: true,
        incidentType: 'CrashLoopBackOff',
        title: `Pod ${resource.name} is failing / crashing`,
        severity: 'MEDIUM',
        technicalDetails: {
          podName: resource.name,
          reason: resource.status,
          message: `Pod ${resource.name} container process exited with error status`,
          nodeName: String(resource.specSummary?.nodeName || 'unknown'),
          containers,
          conditions: resource.conditions,
          events
        }
      };
    }

    // 3. Check for OOMKilled
    for (const c of containers) {
      if (c.terminationReason === 'OOMKilled' || c.exitCode === 137) {
        return {
          detected: true,
          incidentType: 'OOMKilled',
          title: `Container ${c.name} in pod ${resource.name} was OOMKilled (Exit Code 137)`,
          severity: 'HIGH',
          technicalDetails: {
            podName: resource.name,
            containerName: c.name,
            image: c.image,
            restartCount: c.restartCount,
            exitCode: 137,
            reason: 'OOMKilled',
            message: 'Container exceeded allocated memory limits and was killed by Linux OOM killer',
            nodeName: String(resource.specSummary?.nodeName || 'unknown'),
            containers,
            conditions: resource.conditions,
            events
          }
        };
      }
    }

    // 4. Check for Probe failures from events
    for (const evt of events) {
      if (evt.type === 'Warning' && evt.reason === 'Unhealthy') {
        if (evt.message.toLowerCase().includes('liveness probe')) {
          return {
            detected: true,
            incidentType: 'LivenessProbeFailed',
            title: `Liveness probe failure in pod ${resource.name}`,
            severity: 'HIGH',
            technicalDetails: {
              podName: resource.name,
              message: evt.message,
              reason: 'Unhealthy',
              containers,
              conditions: resource.conditions,
              events
            }
          };
        }
        if (evt.message.toLowerCase().includes('readiness probe')) {
          return {
            detected: true,
            incidentType: 'ReadinessProbeFailed',
            title: `Readiness probe failure in pod ${resource.name}`,
            severity: 'MEDIUM',
            technicalDetails: {
              podName: resource.name,
              message: evt.message,
              reason: 'Unhealthy',
              containers,
              conditions: resource.conditions,
              events
            }
          };
        }
      }
    }

    // 5. Pod Failed phase
    if (resource.status === 'Failed') {
      return {
        detected: true,
        incidentType: 'PodFailed',
        title: `Pod ${resource.name} entered Failed phase`,
        severity: 'HIGH',
        technicalDetails: {
          podName: resource.name,
          reason: 'PodFailed',
          message: 'All containers in the Pod have terminated, and at least one container has terminated in failure',
          containers,
          conditions: resource.conditions,
          events
        }
      };
    }

    return null;
  }

  /**
   * Node Rule Evaluation
   */
  private static evaluateNode(resource: KubernetesResource): DetectionResult | null {
    const conditions = resource.conditions || [];
    const events = resource.events || [];

    // Check Ready condition
    const readyCondition = conditions.find((c) => c.type === 'Ready');
    if (readyCondition && (readyCondition.status === 'False' || readyCondition.status === 'Unknown')) {
      return {
        detected: true,
        incidentType: 'NodeNotReady',
        title: `Node ${resource.name} is NotReady (${readyCondition.reason || 'KubeletNotReady'})`,
        severity: 'CRITICAL',
        technicalDetails: {
          nodeName: resource.name,
          reason: readyCondition.reason || 'NodeNotReady',
          message: readyCondition.message || `Node condition Ready is ${readyCondition.status}`,
          conditions,
          events
        }
      };
    }

    // Check Pressure conditions
    const memoryPressure = conditions.find((c) => c.type === 'MemoryPressure');
    if (memoryPressure && memoryPressure.status === 'True') {
      return {
        detected: true,
        incidentType: 'NodeMemoryPressure',
        title: `Node ${resource.name} is experiencing MemoryPressure`,
        severity: 'HIGH',
        technicalDetails: {
          nodeName: resource.name,
          reason: memoryPressure.reason || 'MemoryPressure',
          message: memoryPressure.message || 'Node available memory is below threshold',
          conditions,
          events
        }
      };
    }

    const diskPressure = conditions.find((c) => c.type === 'DiskPressure');
    if (diskPressure && diskPressure.status === 'True') {
      return {
        detected: true,
        incidentType: 'NodeDiskPressure',
        title: `Node ${resource.name} is experiencing DiskPressure`,
        severity: 'HIGH',
        technicalDetails: {
          nodeName: resource.name,
          reason: diskPressure.reason || 'DiskPressure',
          message: diskPressure.message || 'Node root filesystem disk capacity is low',
          conditions,
          events
        }
      };
    }

    const pidPressure = conditions.find((c) => c.type === 'PIDPressure');
    if (pidPressure && pidPressure.status === 'True') {
      return {
        detected: true,
        incidentType: 'NodePIDPressure',
        title: `Node ${resource.name} is experiencing PIDPressure`,
        severity: 'HIGH',
        technicalDetails: {
          nodeName: resource.name,
          reason: pidPressure.reason || 'PIDPressure',
          message: pidPressure.message || 'Node available process IDs are exhausted',
          conditions,
          events
        }
      };
    }

    return null;
  }

  /**
   * Deployment Rule Evaluation
   */
  private static evaluateDeployment(resource: KubernetesResource): DetectionResult | null {
    const desired = Number(resource.specSummary?.replicas ?? 1);
    const ready = Number(resource.statusSummary?.readyReplicas ?? resource.statusSummary?.availableReplicas ?? 0);
    const available = Number(resource.statusSummary?.availableReplicas ?? resource.statusSummary?.readyReplicas ?? 0);
    const updated = Number(resource.statusSummary?.updatedReplicas ?? ready);
    const conditions = resource.conditions || [];
    const events = resource.events || [];

    // Check Kubernetes Deployment Conditions
    const isAvailableCondition = conditions.some((c) => c.type === 'Available' && (c.status === 'True' || c.status === 'true'));
    const isProgressingCondition = conditions.some((c) => c.type === 'Progressing' && (c.status === 'True' || c.status === 'true') && c.reason === 'NewReplicaSetAvailable');
    const isExplicitlyFailed = conditions.some((c) => (c.type === 'Available' && c.status === 'False') || (c.type === 'ReplicaFailure' && c.status === 'True'));

    // If Kubernetes explicitly marks the deployment as Available or progressing normally with ready replicas, it is healthy
    if (isAvailableCondition || (ready >= desired && desired > 0) || (available >= desired && desired > 0)) {
      return null;
    }

    if (desired > 0 && (isExplicitlyFailed || (ready === 0 && available === 0 && !isProgressingCondition) || (ready < desired && available < desired && !isAvailableCondition))) {
      const isCompleteOutage = ready === 0 && available === 0;
      return {
        detected: true,
        incidentType: 'DeploymentDegraded',
        title: `Deployment ${resource.name} is degraded (${ready}/${desired} ready)`,
        severity: isCompleteOutage ? 'CRITICAL' : 'HIGH',
        technicalDetails: {
          desiredReplicas: desired,
          availableReplicas: available,
          readyReplicas: ready,
          updatedReplicas: updated,
          reason: isCompleteOutage ? 'DeploymentUnavailable' : 'DeploymentDegraded',
          message: `Expected ${desired} ready replicas, but currently only ${ready} are ready.`,
          conditions,
          events
        }
      };
    }

    return null;
  }

  /**
   * StatefulSet Rule Evaluation
   */
  private static evaluateStatefulSet(resource: KubernetesResource): DetectionResult | null {
    const desired = Number(resource.specSummary?.replicas ?? 1);
    const ready = Number(resource.statusSummary?.readyReplicas ?? 0);

    if (desired > 0 && ready < desired) {
      return {
        detected: true,
        incidentType: 'StatefulSetDegraded',
        title: `StatefulSet ${resource.name} replica mismatch (${ready}/${desired} ready)`,
        severity: 'HIGH',
        technicalDetails: {
          desiredReplicas: desired,
          readyReplicas: ready,
          reason: 'StatefulSetDegraded',
          message: `StatefulSet expects ${desired} ready replicas, current ready count is ${ready}`,
          conditions: resource.conditions,
          events: resource.events
        }
      };
    }
    return null;
  }

  /**
   * DaemonSet Rule Evaluation
   */
  private static evaluateDaemonSet(resource: KubernetesResource): DetectionResult | null {
    const desired = Number(resource.statusSummary?.desiredNumberScheduled ?? 1);
    const numberReady = Number(resource.statusSummary?.numberReady ?? 0);

    if (desired > 0 && numberReady < desired) {
      return {
        detected: true,
        incidentType: 'DaemonSetDegraded',
        title: `DaemonSet ${resource.name} is degraded (${numberReady}/${desired} nodes scheduled)`,
        severity: 'HIGH',
        technicalDetails: {
          desiredReplicas: desired,
          readyReplicas: numberReady,
          reason: 'DaemonSetDegraded',
          message: `DaemonSet is ready on ${numberReady} nodes out of ${desired} scheduled nodes`,
          conditions: resource.conditions,
          events: resource.events
        }
      };
    }
    return null;
  }

  /**
   * Job Rule Evaluation
   */
  private static evaluateJob(resource: KubernetesResource): DetectionResult | null {
    const failedCount = Number(resource.statusSummary?.failed ?? 0);
    const conditions = resource.conditions || [];

    const failedCondition = conditions.find((c) => c.type === 'Failed' && c.status === 'True');
    if (failedCondition || failedCount > 0) {
      return {
        detected: true,
        incidentType: 'JobFailed',
        title: `Batch Job ${resource.name} has failed`,
        severity: 'MEDIUM',
        technicalDetails: {
          reason: failedCondition?.reason || 'JobFailed',
          message: failedCondition?.message || `Job execution failed after ${failedCount} retries`,
          conditions,
          events: resource.events
        }
      };
    }
    return null;
  }

  /**
   * PVC Rule Evaluation
   */
  private static evaluatePVC(resource: KubernetesResource): DetectionResult | null {
    if (resource.status === 'Pending') {
      return {
        detected: true,
        incidentType: 'PVCPending',
        title: `PersistentVolumeClaim ${resource.name} is stuck in Pending`,
        severity: 'MEDIUM',
        technicalDetails: {
          pvcPhase: 'Pending',
          storageClass: String(resource.specSummary?.storageClassName || 'standard'),
          capacity: String(resource.specSummary?.capacity || 'unknown'),
          reason: 'PVCPending',
          message: 'PersistentVolumeClaim has not bound to a backing PersistentVolume',
          conditions: resource.conditions,
          events: resource.events
        }
      };
    }
    return null;
  }

  /**
   * Deterministic Auto-Recovery Evaluation
   */
  public static evaluateRecovery(
    resource: KubernetesResource,
    incidentType: IncidentType
  ): RecoveryResult {
    switch (incidentType) {
      case 'CrashLoopBackOff':
      case 'ImagePullBackOff':
      case 'ErrImagePull':
      case 'OOMKilled':
      case 'PodFailed': {
        const containers = resource.containers || [];
        const allRunningAndReady =
          resource.status === 'Running' &&
          containers.length > 0 &&
          containers.every((c) => c.ready && c.state === 'running' && !c.waitingReason);
        if (allRunningAndReady) {
          return {
            recovered: true,
            reason: `Pod ${resource.name} is now Running and all containers are in Ready state`
          };
        }
        break;
      }
      case 'NodeNotReady':
      case 'NodeMemoryPressure':
      case 'NodeDiskPressure':
      case 'NodePIDPressure': {
        const conditions = resource.conditions || [];
        const readyCond = conditions.find((c) => c.type === 'Ready');
        const isReady = readyCond?.status === 'True';
        const memPress = conditions.find((c) => c.type === 'MemoryPressure')?.status === 'True';
        const diskPress = conditions.find((c) => c.type === 'DiskPressure')?.status === 'True';
        const pidPress = conditions.find((c) => c.type === 'PIDPressure')?.status === 'True';

        if (incidentType === 'NodeNotReady' && isReady) {
          return { recovered: true, reason: `Node ${resource.name} condition Ready transitioned to True` };
        }
        if (incidentType === 'NodeMemoryPressure' && !memPress) {
          return { recovered: true, reason: `Node ${resource.name} memory pressure has cleared` };
        }
        if (incidentType === 'NodeDiskPressure' && !diskPress) {
          return { recovered: true, reason: `Node ${resource.name} disk pressure has cleared` };
        }
        if (incidentType === 'NodePIDPressure' && !pidPress) {
          return { recovered: true, reason: `Node ${resource.name} PID pressure has cleared` };
        }
        break;
      }
      case 'DeploymentDegraded': {
        const desired = Number(resource.specSummary?.replicas ?? 1);
        const ready = Number(resource.statusSummary?.readyReplicas ?? resource.statusSummary?.availableReplicas ?? 0);
        const available = Number(resource.statusSummary?.availableReplicas ?? resource.statusSummary?.readyReplicas ?? 0);
        const conditions = resource.conditions || [];
        const isAvailableCondition = conditions.some((c) => c.type === 'Available' && (c.status === 'True' || c.status === 'true'));

        if (isAvailableCondition || (desired > 0 && (available >= desired || ready >= desired)) || resource.status === 'Available') {
          return {
            recovered: true,
            reason: `Deployment ${resource.name} replicas fully restored and marked Available`
          };
        }
        break;
      }
      case 'StatefulSetDegraded': {
        const desired = Number(resource.specSummary?.replicas ?? 1);
        const ready = Number(resource.statusSummary?.readyReplicas ?? 0);
        if (desired > 0 && ready >= desired) {
          return {
            recovered: true,
            reason: `StatefulSet ${resource.name} all ${ready} replicas are ready`
          };
        }
        break;
      }
      case 'PVCPending': {
        if (resource.status === 'Bound') {
          return {
            recovered: true,
            reason: `PersistentVolumeClaim ${resource.name} is now Bound to storage`
          };
        }
        break;
      }
    }

    return { recovered: false, reason: '' };
  }
}
