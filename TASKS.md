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
- [x] CTX-001: Keep MVP context UI limited to `SELECTION` and `ACTIVE_RESOURCE`; show future modes as disabled until backend gates exist.
- [x] CTX-001: Provide bootstrap context-mode labels and availability helpers.
- [x] CTX-002: Add consent-grant UI states for active, missing, revoked, and expired consent before context capture.
- [x] CTX-003: Render normalized context metadata and truncation/redaction indicators without logging or persisting raw document content.
- [ ] CTX-004: Make client-supplied context visibly non-authoritative for write-back unless connector-verified target metadata exists.
- [ ] EVT-001: Wire authenticated HTTP command calls for auth setup, provider-key validation, resource/session creation, context preview, command creation, action approval, and apply-action.
- [ ] EVT-003: Add an authenticated SSE client for session streams with reconnect, `Last-Event-ID`, event ID dedupe, and HTTP durable-state refresh after gaps.
- [ ] EVT-003: Add integration tests with mocked backend HTTP and SSE endpoints for onboarding, context preview, command creation, session events, proposed actions, and apply-action flows.
- [x] EVT-003: Provide a bootstrap session-event reducer for progress, assistant deltas, assistant final, errors, action proposed, and action status changed.
- [x] EVT-003: Add M5 local SSE frame/client helpers for full `SessionEvent` envelopes, event ID dedupe, `Last-Event-ID` reconnect cursor metadata, sequence-gap warnings, malformed-frame handling, and metadata-only stream logs.
- [x] EVT-003: Render M5 command accepted, progress, assistant delta accumulation, assistant final, duplicate event, malformed event, sequence-gap, reconnect-required, and safe error states in the local UI harness.
- [x] EVT-003: Cover M5 session stream behavior with Vitest reducer/helper tests and Firefox Playwright UI assertions.
- [x] ACTION-003: Add M2 proposed-action approve/reject UI that creates backend-shaped action decision commands and treats duplicate responses deterministically.
- [x] ACTION-004: Add M2 safe apply-action UI that creates backend-shaped apply commands with idempotency keys, requires backend-shaped apply results before terminal states, handles duplicate apply attempts deterministically, and never calls connector mutation APIs directly.
- [x] ACTION-004: Provide bootstrap proposed-action status helpers for review, approval, rejection, applied, conflicted, failed, and expired states.
- [x] ACTION-005: Limit M2 write-back UI to connector-verified safe replace/insert proposals.
- [x] EXT-001: Define the Google Docs browser-extension MVP surface, including supported-page injection, compact assistant panel behavior, current document ID detection, backend-only HTTP/SSE calls, no sensitive local retention, and typed user-facing unsupported-page or missing-document states.
- [x] EXT-002: Implement browser sidebar/side-panel PR-style proposed-edit review UI for Google Docs edits with target text, replacement text, surrounding context, rationale, status, action ID, individual approve/reject controls, safe approve-all behavior, backend-shaped apply-action with idempotency key, and conflict rendering for stale, ambiguous, overlapping, or unverifiable targets.
- [x] OPS-003: Verify M2 browser logs and client-side error handling exclude provider keys, OAuth tokens, bearer tokens, prompts, selected text, document text, model responses, screenshots, OCR text, accessibility-tree content, and action payloads.
- [x] SAFE-003: Verify the M2 frontend does not retain raw prompts, document text, model responses, screenshots, OCR text, accessibility trees, or action payloads outside active user-visible session state.
- [ ] INFRA-005: Document required local frontend configuration for service endpoints, tenant/user bootstrap, provider adapters, Google OAuth, and stubbed services.
- [ ] INFRA-005: Add deployment-style pipeline tasks for frontend install, lint or static checks, unit tests, browser integration tests, build artifact generation, and Amplify hosting handoff.
- [ ] INFRA-005: Add deployment readiness checks for endpoint configuration, auth/OAuth redirect settings, SSE connectivity, CSP, and no-secret client bundles.

## M3 First-Run Setup Progress

- [x] Render backend-shaped setup state from M3-compatible local responses and contract fixtures in tests.
- [x] Show login/session, Google OAuth, provider-secret, resource-session, and safe setup error states.
- [x] Keep first-run setup context posture at `SELECTION`; future modes remain out of this setup harness.
- [x] Verify setup log payloads exclude OAuth tokens, provider keys, bearer tokens, prompts, document text, model responses, screenshots, and action payloads.
- [x] Add tests that import and validate real M3 setup fixtures from `ai-assist-contracts`.

## M4 Google Docs Read-Path Harness Progress

- [x] Render read-path readiness for Google Docs `SELECTION` and `ACTIVE_RESOURCE` context.
- [x] Render active, missing, revoked, and expired consent states before context capture.
- [x] Render normalized context metadata with content hash, truncation state, revision, provenance, and connector trust without rendering raw document text or selected text in the readiness cards.
- [x] Render reconnect-required and permission failure states with safe user-facing messages.
- [x] Verify M4 client log events exclude OAuth tokens, authorization headers, document text, selected text, prompts, model responses, screenshots, OCR, accessibility trees, provider keys, and action payloads.
- [x] Add tests that import and validate real M4 read-path fixtures from `ai-assist-contracts`.
- [x] Browser smoke check passes for the local M4 read-path readiness harness.
- [x] Fresh M4 web review feedback is written under ignored `feedback/` with no blocking findings.

## M6 Durable Proposed-Action UI Progress

- [x] M6-T4: Render proposed-action review cards from full `SessionEvent` `action.proposed` payloads.
- [x] M6-T4: Add or verify approve and reject command UI with backend-shaped command payloads.
- [x] M6-T4: Update action statuses from `action.status_changed` events.
- [x] M6-T4: Render proposed, approved, rejected, expired, denied, and safe error states.
- [x] M6-T4: Verify action payload plaintext is not logged and appears only in active user-visible review state when needed.
- [x] M6-T4: Run web unit tests, production build, and Firefox e2e checks for the browser-facing UI.
- [x] M6-T4: Fresh reviewer feedback is written under ignored `feedback/` with no unresolved blocking findings.

## M2 Local Sidebar Demo Progress

- [x] Implement a sidebar/side-panel assistant shell as the primary M2 UI surface for the local demo.
- [x] Model a Google Docs content-script bridge view model for document ID, URL, title, support state, and revision metadata.
- [x] Render PR-style proposed-edit cards from M1 contract-compatible data.
- [x] Add tests that import and validate real M1 action review and apply-command fixtures from `ai-assist-contracts`.
- [x] Split apply into a backend-shaped apply request plus mocked backend-shaped result before terminal `APPLIED`, `FAILED`, or `CONFLICTED` state.
- [x] Clear mocked chat prompt state when the side panel closes.
- [x] Keep the M2 primary UI as a browser sidebar/side-panel, with floating in-document affordances deferred.
- [x] Cover approve, reject, approve-all safety, duplicate handling, apply idempotency keys, conflict states, and safe logging in unit tests.
- [x] Firefox Playwright demo validation passes for the local M2 sidebar/side-panel harness.
- [x] M6-T1b: Rename runtime assistant-demo module, exported helpers, fixture IDs, setup demo values, and product-facing README text from milestone labels to product-generic names.

## M7 Safe Apply UI Progress

- [x] M7-T5: Web apply UI sends backend-shaped apply requests with idempotency keys and never calls connector mutation APIs directly.
- [x] M7-T5: Render applied, conflicted, failed, expired, denied, reconnect-required, duplicate replay, and safe error states from backend-shaped responses or status events.
- [x] M7-T5: Reconcile durable HTTP apply responses and SSE `action.status_changed` events into review card state.
- [x] M7-T5: Keep apply-state runtime names, CSS classes, and log-event names product-generic.
- [x] M7-T5: Verify browser/client logs exclude OAuth tokens, provider keys, authorization headers, document text, selected text, prompts, model response bodies, action payload plaintext, screenshots, OCR, and accessibility trees.
- [x] M7-T5: Run web unit tests, production build, and Firefox e2e checks for the browser-facing UI.

## M8 Real-Flow UX Hardening Progress

- [x] M8-T5: Render product-session and expired-session states from backend-shaped setup data.
- [x] M8-T5: Render Google connect, status, reconnect, and disconnect route/state coverage without exposing OAuth tokens.
- [x] M8-T5: Show platform provider availability as the default trusted-user path, with BYO provider-key cards retained only as optional fallback state.
- [x] M8-T5: Render document readiness, selected/active resource context, ask/stream, proposed-action review, approve/reject, apply, conflict, failed, denied, and reconnect-required states.
- [x] M8-T5: Add configurable HTTP/SSE client route helpers while keeping deterministic fake-backed tests.
- [x] M8-T5: Cover loading, retry, empty, disabled, quota/rate-limit, provider-unavailable, stale-document, and uncertain-mutation style safe error states.
- [x] M8-T5: Verify browser/client log helpers exclude forbidden sensitive content.
- [x] M8-T5: Add responsive layout coverage for the real-flow state grid.

## E2E-Owned UI Validation

- [ ] E2E-001: Validate first-run onboarding UI for login, Google connection, provider-key entry, provider validation result, and Google resource-session start.
- [ ] E2E-002: Validate read/context/generate UI for consent, Google Docs context state, selected provider, SSE progress, assistant delta, and assistant final rendering.
- [ ] E2E-003: Validate proposed-action review UI for action proposed events, approve/reject commands, ownership failure display, and no action-payload logging.
- [ ] E2E-004: Validate safe apply-action UI for one successful apply, same-key retry result, stale-document `CONFLICTED` result, and action status event rendering.
- [ ] E2E-005: Validate operational guardrail UI for rate-limited provider-key validation, command creation, context preview, SSE stream creation, apply-action, expired `SessionSecrets`, revoked Google OAuth, and safe error display.
- [ ] E2E-005: Validate UI failure modes for backend outage, SSE reconnect gaps, malformed events, expired auth, revoked consent, provider validation rate limits, and stale apply-action conflicts.

## Quality Tasks

- [x] Raise line coverage to at least 95%.
- [ ] Add accessibility and responsive layout checks.
- [x] Add browser-based end-to-end tests.
- [ ] Add Amplify hosting integration in coordination with `ai-assist-infra`.
