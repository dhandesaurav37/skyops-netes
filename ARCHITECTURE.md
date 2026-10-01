# SkyOps Architecture

SkyOps is a React/Vite console, an Express API, a Firebase Authentication identity layer, a Firestore control plane, tenant-scoped object storage, and a Go Kubernetes agent.

## Request and tenant flow

The browser sends a Firebase ID token and optional active organization selector to the API. `requireUserAuth` verifies the token. `requireOrgMembership` resolves an active organization membership and role from server persistence. Fine-grained permission middleware protects mutations and sensitive reads. Route handlers pass the resolved organization to store operations, which verify resource ownership. Firestore Admin access bypasses client rules; API authorization is therefore mandatory. Browser Firestore rules deny all control-plane collections.

## Data and agents

Organizations, users, memberships, clusters, incidents, remediation state, policies, audit events, billing, integrations, and artifact metadata are control-plane data in Firestore. Frequent cluster telemetry is abstracted behind `TelemetryStore`, allowing a future metrics/log store without changing API consumers. The Go agent authenticates with a cluster-scoped bearer credential, reports telemetry and heartbeat, receives authorized actions, and returns execution status for server-side verification.

## Remediation and AI

AI analysis is advisory. Server-side remediation policy and actual cluster state validate any proposed operation. A human approval is required before dispatch, the agent enforces its own policy, and fresh telemetry verifies the result. Incident evidence distinguishes observed telemetry from derived analysis and AI inference in the engine data model.

## Runtime and reliability

The Express process exposes health and metrics endpoints and currently performs webhook background work in a process-local queue. In-memory caches and local snapshot persistence support development, but critical production async work requires Cloud Tasks or Pub/Sub and horizontally safe durable state. Production persistence initialization is a startup gate. Use Firebase emulators locally and deployed restrictive rules plus realistic identities in staging.
