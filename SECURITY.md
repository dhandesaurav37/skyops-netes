# Security

## Identity and authorization

Browser users authenticate with Firebase Authentication ID tokens. The API verifies token signature, issuer, audience, expiry, and Firebase project before attaching a user identity. Organization membership is resolved from persisted membership records; role claims in browser requests and profile documents are not authoritative. API handlers derive organization, actor, and cluster context from authenticated server state.

Roles OWNER, ADMIN, OPERATOR, ENGINEER, and VIEWER map to explicit permissions in `server/auth.ts`. Resource reads and mutations must use the resolved `req.orgId`; cluster and incident store lookups also enforce organization ownership. Never accept an org, user, role, cluster, or remediation identity from a request body as authorization evidence.

## Firestore and Storage

`firestore.rules` permits a user to read and maintain a restricted self-profile only. Organizations, memberships, clusters, incidents, remediations, audit events, billing, webhooks, tokens, and telemetry are denied to browser SDKs. The backend uses Firebase Admin SDK credentials and is responsible for authorization before access. Production startup fails if persistence cannot initialize.

Storage paths are tenant scoped under `tenants/{orgId}/{category}/...`; Storage rules require an active membership document matching both organization and Firebase UID, validate category, metadata, MIME type, and upload size, and deny all other paths. Sensitive uploads and downloads should use the authenticated storage API for application audit and validation.

## Remediation and agents

Remediation proposals are checked against supported action types and observed cluster/resource state. A human with remediation approval permission must approve before dispatch; the agent independently applies policy and reports execution results for verification. AI can propose but cannot execute actions. Agent credentials are cluster scoped, stored as hashes for lookup and encrypted at rest for rotation support; configure `SKYOPS_AGENT_TOKEN_ENCRYPTION_KEY` as a stable secret in production. Installation credentials are short-lived and must not be logged.

## Environments and secrets

Development can run `firebase emulators:start` using the checked-in `firebase.json`. Set `VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099`, `VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. The API accepts emulator tokens only with a loopback host in development. Do not point production at emulators or enable demo auth. Production requires HTTPS `APP_URL`, explicit `CORS_ORIGINS`, Firebase project configuration, durable Firestore, and persistent agent-token encryption key. Keep Gemini, Razorpay, SMTP, service-account, and encryption credentials in a secret manager or runtime environment, never in `VITE_*` variables or source control.

## Known limitations

The current API process still holds operational caches and the background job queue in memory. Those are not suitable for multi-instance Cloud Run durability; webhook and scheduled job delivery should move to Cloud Tasks or Pub/Sub before relying on them for critical work. Browser self-profile documents are presentation data only. Firestore rule and Storage rule emulator suites should be run in staging before deployment.
