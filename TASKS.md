# Task Breakdown

Update this file as implementation progresses. Check off completed tasks in the same change that implements or verifies them.

Canonical cross-repo source: `../ai-assist-architecture/implementation-task-breakdown.md`.
Relevant design sources: frontend, provider-key, command, SSE, context, proposed-action, security, and E2E sections in `../ai-assist-architecture/ai-workflow-assistant-platform-architecture-spec.md`; `../ai-assist-architecture/lld-session-events-transport.md`; `../ai-assist-architecture/lld-context-connectors.md`; `../ai-assist-architecture/lld-actions-writeback.md`; and `../ai-assist-architecture/lld-operations-safety.md`.

## Completed Bootstrap

- [x] Create dependency-light static frontend shell.
- [x] Implement onboarding state helpers.
- [x] Implement context mode labels and availability helpers.
- [x] Implement provider setup status helpers.
- [x] Implement session event reducer and proposed-action state helpers.
- [x] Implement safe user-facing error mapping.
- [x] Add unit tests using `node:test`.
- [x] Document tests and coverage commands.
- [x] Ignore local prompts, feedback, coverage output, dependencies, and build artifacts.

## Architecture Tasks

- [ ] REPO-001: Decide final frontend language, runtime, framework, package manager, and package/module layout; compare the static ESM bootstrap with React or Next.js on Amplify Hosting.
- [x] REPO-002: Migrate this repo from the temporary static ESM bootstrap to a TypeScript frontend stack, likely React plus Vite unless Next.js is later justified, preserving or intentionally superseding current onboarding, context-mode, provider-status, session-event, proposed-action, safe-error, and test coverage behavior.
- Migration gate: Do not continue broad new frontend feature work until the TypeScript frontend migration is completed or explicitly deferred; REPO-001 remains open for framework, package manager, and package/module layout decisions.
- [ ] AUTH-002: Add authenticated product-session UI flows for login, logout, session status, token expiry, refresh, and distinct unauthorized/expired/malformed credential states.
- [ ] AUTH-003: Add Google OAuth connect, callback result, status, reconnect-required, and disconnect UI without exposing OAuth tokens.
- [ ] AUTH-005: Add provider-key entry and validation UI that sends keys only to backend HTTPS APIs, displays metadata/fingerprint only, and handles validation rate limits safely.
- [ ] CTX-001: Keep MVP context UI limited to `SELECTION` and `ACTIVE_RESOURCE`; show future modes as disabled until backend gates exist.
- [x] CTX-001: Provide bootstrap context-mode labels and availability helpers.
- [ ] CTX-002: Add consent-grant UI states for active, missing, revoked, and expired consent before context capture.
- [ ] CTX-003: Render normalized context metadata and truncation/redaction indicators without logging or persisting raw document content.
- [ ] CTX-004: Make client-supplied context visibly non-authoritative for write-back unless connector-verified target metadata exists.
- [ ] EVT-001: Wire authenticated HTTP command calls for auth setup, provider-key validation, resource/session creation, context preview, command creation, action approval, and apply-action.
- [ ] EVT-003: Add an authenticated SSE client for session streams with reconnect, `Last-Event-ID`, event ID dedupe, and HTTP durable-state refresh after gaps.
- [ ] EVT-003: Add integration tests with mocked backend HTTP and SSE endpoints for onboarding, context preview, command creation, session events, proposed actions, and apply-action flows.
- [x] EVT-003: Provide a bootstrap session-event reducer for progress, assistant deltas, assistant final, errors, action proposed, and action status changed.
- [ ] ACTION-003: Add proposed-action approve/reject UI that uses authenticated HTTP commands and treats duplicate responses deterministically.
- [ ] ACTION-004: Add safe apply-action UI that requires backend apply results, handles idempotent retries, and never calls connector mutation APIs directly.
- [x] ACTION-004: Provide bootstrap proposed-action status helpers for review, approval, rejection, applied, conflicted, failed, and expired states.
- [ ] ACTION-005: Limit MVP write-back UI to connector-verified safe replace/insert proposals.
- [x] EXT-001: Define the Google Docs browser-extension MVP surface, including supported-page injection, compact assistant panel behavior, current document ID detection, backend-only HTTP/SSE calls, no sensitive local retention, and typed user-facing unsupported-page or missing-document states.
- [ ] EXT-002: Implement PR-style proposed-edit review UI for Google Docs edits with target text, replacement text, surrounding context, rationale, status, action ID, individual approve/reject controls, safe approve-all behavior, backend-only apply-action with idempotency key, and conflict rendering for stale, ambiguous, overlapping, or unverifiable targets.
- [ ] OPS-003: Verify browser logs and client-side error handling exclude provider keys, OAuth tokens, bearer tokens, prompts, selected text, document text, model responses, screenshots, OCR text, accessibility-tree content, and action payloads.
- [ ] SAFE-003: Verify the frontend does not retain raw prompts, document text, model responses, screenshots, OCR text, accessibility trees, or action payloads outside the active user-visible session state.
- [ ] INFRA-005: Document required local frontend configuration for service endpoints, tenant/user bootstrap, provider adapters, Google OAuth, and stubbed services.
- [ ] INFRA-005: Add deployment-style pipeline tasks for frontend install, lint or static checks, unit tests, browser integration tests, build artifact generation, and Amplify hosting handoff.
- [ ] INFRA-005: Add deployment readiness checks for endpoint configuration, auth/OAuth redirect settings, SSE connectivity, CSP, and no-secret client bundles.

## E2E-Owned UI Validation

- [ ] E2E-001: Validate first-run onboarding UI for login, Google connection, provider-key entry, provider validation result, and Google resource-session start.
- [ ] E2E-002: Validate read/context/generate UI for consent, Google Docs context state, selected provider, SSE progress, assistant delta, and assistant final rendering.
- [ ] E2E-003: Validate proposed-action review UI for action proposed events, approve/reject commands, ownership failure display, and no action-payload logging.
- [ ] E2E-004: Validate safe apply-action UI for one successful apply, same-key retry result, stale-document `CONFLICTED` result, and action status event rendering.
- [ ] E2E-005: Validate operational guardrail UI for rate-limited provider-key validation, command creation, context preview, SSE stream creation, apply-action, expired `SessionSecrets`, revoked Google OAuth, and safe error display.
- [ ] E2E-005: Validate UI failure modes for backend outage, SSE reconnect gaps, malformed events, expired auth, revoked consent, provider validation rate limits, and stale apply-action conflicts.

## Quality Tasks

- [ ] Raise line coverage to at least 95%.
- [ ] Add accessibility and responsive layout checks.
- [ ] Add browser-based end-to-end tests.
- [ ] Add Amplify hosting integration in coordination with `ai-assist-infra`.
