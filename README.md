# ai-assist-web

TypeScript React frontend for the AI Assist Platform.

This repo uses React plus Vite for the browser shell and keeps the core
onboarding, context-mode, provider-status, session-event, proposed-action, and
safe-error behavior in pure TypeScript helpers with unit tests.

## Current Contents

- `index.html`: Vite HTML entrypoint.
- `src/main.tsx`: React root renderer.
- `src/App.tsx`: sidebar/side-panel assistant demo shell using the tested state helpers.
- `src/onboarding-state.ts`: onboarding step derivation for auth, Google,
  provider setup, and resource session readiness.
- `src/context-modes.ts`: context mode labels and availability state.
- `src/provider-setup.ts`: provider credential setup state for OpenAI,
  Anthropic, and future Bedrock mode.
- `src/setup-state.ts`: First-run setup state mapping for product session,
  Google OAuth, provider-secret readiness, resource-session readiness, safe
  setup errors, and metadata-only setup log events.
- `src/context-readiness.ts`: Google Docs read-path readiness state mapping for
  `SELECTION`, `ACTIVE_RESOURCE`, consent states, normalized context metadata,
  reconnect-required, permission failures, and metadata-only client log events.
- `src/session-events.ts`: reducer for SSE-style session events.
- `src/real-flow-client.ts`: configurable backend-shaped HTTP/SSE route and
  visible state helpers for trusted-user setup, ask/stream, review/apply, and
  safe retry/error UI.
- `src/proposed-actions.ts`: user-facing proposed-action state helpers.
- `src/extension-surface.ts`: Google Docs browser-extension MVP surface
  contract for page support, document ID detection, backend ownership, and safe
  user-facing states.
- `src/dogfood-sidebar-state.ts`: M12 dogfood sidebar state contract for the
  real assistant default surface, command readiness, stream readiness, proposed
  actions, apply gating, dev harness disposition, and metadata-only state logs.
- `extension/`: Chrome MV3 trusted-owner dogfood side-panel shell, content
  script, service worker, and deployed dev runtime endpoint config.
- `src/assistant-demo.ts`: local side-panel demo helpers for content-script
  bridge metadata, mocked chat state, PR-style review cards, approve/reject,
  approve-all, backend-shaped apply requests, and mocked apply results.
- `src/error-mapping.ts`: safe error category/code to user-message mapping.
- `test/*.test.ts`: contract-oriented unit tests using Vitest.

## Framework Choice

REPO-002 migrated the temporary static ESM bootstrap to React plus Vite.
Next.js is not justified for this slice because the current product surface is a
standalone authenticated app shell without server rendering, file-based routing,
or backend-for-frontend requirements. Vite keeps the local workflow small and
matches the intended Amplify static hosting path.

## Future Amplify And Backend Wiring

1. Keep `src/*` helpers pure and reuse them from framework state/hooks as the UI grows.
2. Add generated or packaged schemas from `ai-assist-contracts` before wiring
   real HTTP and SSE clients.
3. Introduce Amplify hosting config in `ai-assist-infra`; keep frontend secrets
   out of build-time and runtime browser config.
4. Add authenticated routes/views for onboarding, provider setup, resource
   selection, session chat, and action review.

The browser must never receive provider API keys from the backend or call model
providers directly. Provider credentials are user-entered, posted to backend
services, KMS-encrypted as short-lived session secrets, and represented in the UI
only by safe status metadata.

## Google Docs Extension MVP Surface

`ai-assist-web` is not the ideal long-term home for packaged browser-extension
code. If a dedicated `ai-assist-browser-extension` repo is created, it should
own the manifest, content script, browser sidebar or side-panel shell, browser
permissions, and release packaging. Until then, this repo owns the typed MVP
surface contract so web and future extension UI stay aligned.

The extension-owned surface is limited to:

1. Detect supported Google Docs document pages at `docs.google.com/document/...`.
2. Host the main assistant UI in a browser sidebar or side panel.
3. Use a Google Docs content script to report the current document ID and future
   allowed page context to the sidebar/side-panel UI.
4. Optionally expose a small in-document open-assistant affordance later.
5. Send the detected document ID as resource metadata to backend-owned HTTP
   command APIs and SSE subscriptions.
6. Keep raw prompts, selected text, document text, model responses, screenshots,
   OCR text, accessibility content, and proposed-action payloads only in active
   user-visible state.

Backend services own product auth, Google OAuth tokens, provider credentials,
model-provider calls, Google Docs read/mutation APIs, proposed-action storage,
approval/rejection, idempotent apply-action, and status events. Extension code
must not call OpenAI, Anthropic, Google mutation APIs, secret storage, or direct
OAuth token endpoints.

## Local Side-Panel Demo

The local demo uses the sidebar/side-panel as the primary UI surface. It
models a Google Docs content-script bridge for document metadata, keeps mocked
chat state in active visible UI state, renders PR-style proposed-edit cards, and
supports approve, reject, approve-all, and apply controls.

The non-demo web-side work is implemented and covered by unit tests. The
remaining local validation step is the user-owned browser demo.

Apply does not mark an action applied from a client click. The Apply control
creates a backend-shaped `actions.apply` command with an idempotency key. A
separate mocked backend-shaped result transitions the card to `APPLIED`,
`FAILED`, or `CONFLICTED`.

Runtime demo data stays contract-compatible without importing sibling fixtures
into the browser bundle. Tests import and validate the real Google Docs vertical-slice fixtures from
`ai-assist-contracts`.

`src/extension-surface.ts` exposes typed user-facing states:

- `READY`: supported Google Docs document page with a detected document ID.
- `UNSUPPORTED_PAGE`: no assistant injection because the page is outside the
  supported Google Docs document surface.
- `MISSING_DOCUMENT_ID`: Google Docs page shape is recognized, but no usable
  document ID is available.

## Trusted-Owner Dogfood Extensions

M10 dogfooding uses a browser side-panel/sidebar package as the primary product
surface. Chrome uses the MV3 side-panel package in `extension/`. Firefox uses
the WebExtension sidebar package in `extension/firefox/`. Both packages are
intentionally small:

1. `content-script.js` runs only on `https://docs.google.com/document/*` and
   extracts the current Google Docs document ID from the URL path.
2. Chrome `service-worker.js` or Firefox `background.js` stores non-secret
   deployed dev endpoint config and relays the active document context to the
   side-panel/sidebar UI.
3. Chrome `sidepanel.html`/`sidepanel.js` or Firefox
   `sidebar.html`/`sidebar.js` shows the detected document ID and embeds the
   built Vite app from `dist/index.html`.

Build the Firefox dogfood extension package from this repo:

```sh
npm run build:extension:firefox:dev
```

Then open `about:debugging#/runtime/this-firefox`, choose "Load Temporary
Add-on", and select
`/Users/mel/ai-assist-platform/ai-assist-web/extension/firefox/manifest.json`.
Open a Google Doc, click the AI Assist toolbar icon, and Firefox will open the
AI Assist sidebar. The build script copies the generated Vite app into ignored
`extension/firefox/dist/` because Firefox serves sidebar files only from the
temporary add-on directory.

Build the Chrome dogfood extension package from this repo:

```sh
npm run build:extension:chrome:dev
```

Then load `/Users/mel/ai-assist-platform/ai-assist-web/extension` as an
unpacked extension in Chrome with Developer Mode enabled. The build script
copies the generated Vite app into ignored `extension/dist/` because Chrome
serves extension files only from the unpacked extension directory.

`npm run build:extension:dev` remains an alias for the Chrome build.

The committed extension configs are examples only. Before dogfooding against a
deployed environment, create local ignored runtime config files from the examples
and replace the placeholder HTTP API origin with the deployed dev value:

```sh
cp extension/config.example.json extension/config.dev.json
cp extension/firefox/config.example.json extension/firefox/config.dev.json
```

M11 product login uses Cognito Hosted UI from the sidebar/side-panel. The
extension launches Hosted UI through the browser identity API, so invited users
can complete Cognito's first-login password setup in the Cognito window and
return to the authenticated sidebar without AWS CLI password commands. Configure
the ignored local extension config with non-secret Cognito values from the
`AiAssistDevAuthStack` outputs:

- `cognitoAuthBaseUrl`: the deployed Cognito Hosted UI domain origin.
- `cognitoClientId`: the public app client ID.
- `cognitoRedirectUri`: the browser extension identity redirect URI registered
  on the Cognito app client callback URLs.
- `cognitoLogoutRedirectUri`: the matching registered logout URL.
- `googleOAuthRedirectTarget`: the same browser extension identity redirect URI
  so the deployed Google OAuth callback can return to the extension flow after
  `/oauth/google/start`.
- `cognitoScopes`: `openid`, `email`, and `profile` for product identity.
- `cognitoResponseType`: `token` for the current public-client sidebar flow.

Before live sidebar sign-in proof, the infra auth stack must be deployed with
the actual extension identity redirect URLs in ignored
`ai-assist-infra/cdk.context.json`. Use the registered callback/logout URL that
matches the browser package being loaded:

- Chrome: `https://<chrome-extension-id>.chromiumapp.org/`
- Firefox temporary add-on:
  `https://<temporary-addon-id>.extensions.allizom.org/`

The Firefox dogfood manifest sets a stable
`browser_specific_settings.gecko.id` so `browser.identity.getRedirectURL()`
stays stable across temporary add-on reloads. For the current dev Firefox
package, the Cognito callback/logout URL is:

```text
https://bc695a95a18885fb3d7f6f61fea4f72e0be4b084.extensions.allizom.org/
```

After `AiAssistDevAuthStack` deploys, copy only non-secret outputs into the
ignored extension config, rebuild the package, reload the extension, and then
sign in from the sidebar. Do not use the committed examples as live proof while
they still contain placeholder extension IDs.

Chrome stores returned product-auth tokens in extension session storage. Firefox
keeps them in the extension background page memory for the temporary add-on
session because Firefox MV2 does not provide the same session storage boundary.
The sidebar sends only auth status and endpoint metadata to the embedded app URL;
it does not put ID tokens, access tokens, refresh tokens, OAuth tokens, provider
keys, document text, prompts, or model output in query strings, logs, or
committed config. Backend product-route calls must request the bearer value from
the extension background boundary and send it as an `Authorization: Bearer ...`
header. Google OAuth remains a separate step after product login.

After product login reaches `signed_in`, use the sidebar/side-panel
`Connect Google` action. The extension background reads the Cognito ID token
from its storage boundary, calls `POST /oauth/google/start` with
`Authorization: Bearer ...`, launches the returned Google authorization URL
through the browser identity flow, then refreshes `GET /oauth/google/status`.
The sidebar shows not-connected, connecting, connected, reconnect-required,
access-denied, auth-expired, and dependency-error states. The embedded app URL
receives only `productAuthStatus` and `googleOAuthStatus`; ID tokens, access
tokens, Google OAuth tokens, authorization codes, provider keys, document
content, prompts, and model output must not appear in iframe URLs, logs, or
tracked config.

For deployed dogfood builds, pass matching Vite runtime env values without
committing the endpoint:

```sh
VITE_API_BASE_URL=<dev-http-api-base-url> \
VITE_SSE_BASE_URL=https://sse.dev.melsifen-ai-assist.com \
VITE_DEMO_SESSION_ID=session-dogfood-dev \
npm run build:extension:firefox:dev
```

Endpoint locations are public metadata, not credentials, but the concrete API
Gateway URL should stay in ignored local config or shell history rather than
tracked files. Do not add bearer tokens, OAuth tokens, provider keys, bootstrap
secrets, cookies, or raw document content to extension config, extension
storage, logs, query strings, or committed files. The side panel/sidebar passes
only document ID and endpoint metadata to the embedded app shell; backend
services own product auth, Google OAuth, model providers, Google Docs read/write
APIs, proposed-action persistence, and apply-action.

`https://dev.melsifen-ai-assist.com` is supporting infrastructure for OAuth
redirects, hosted assets, diagnostics, or fallback setup. It is not the primary
M10 dogfood UI while the owner is working in Google Docs.

## M12 Dogfood Sidebar State Contract

M12 makes the real assistant the default sidebar surface. The product UI must
derive command readiness from these state inputs before enabling prompt
submission:

1. Product auth is `signed_in`.
2. Google OAuth is `connected`.
3. The active page is a supported Google Docs document with a detected document
   ID.
4. Backend context readiness is `ready`; missing consent, permission denied, or
   backend dependency failures block submission with specific messages.
5. Provider readiness is `ready`; missing, unavailable, rate-limited, or error
   states block submission.
6. No command is already submitting and the previous command state is not a
   blocking failure.

`src/dogfood-sidebar-state.ts` is the executable contract for this state model.
It intentionally keeps the sidebar default as `assistant`, not a harness. Its
safe log event records only metadata such as status enums, blocker codes, and
whether an active document ID exists. It does not log document IDs, raw prompts,
document text, selected text, model output, OAuth tokens, bearer tokens,
provider keys, screenshots, OCR text, accessibility trees, or action payloads.

Streaming and apply are separate readiness gates. SSE reconnect gaps require an
HTTP durable-state refresh before apply. Proposed actions can be reviewed only
when backend state or explicitly labeled deterministic tests provide them.
Apply stays disabled unless proposed actions are ready, apply state is ready,
stream state does not require refresh, and controlled-document write approval is
present.

Existing deterministic panels remain useful for development coverage, but they
must not be the dogfood default:

- `setup-harness`, `context-readiness-harness`, `real-flow-harness`, and
  `session-stream-harness`: keep behind an explicit dev affordance.
- Mock chat/review demo state from `assistant-demo.ts` and the current
  harness-first `App.tsx` path: remove from dogfood builds or keep only in
  explicitly labeled deterministic tests.

## First-Run Setup Harness

The local app also renders backend-shaped first-run setup states. The setup
harness covers product-session status, Google OAuth status,
provider-secret readiness, resource-session readiness, safe user-facing errors,
and the default `SELECTION` context posture.

Tests import the real setup fixtures from `ai-assist-contracts` and map them
through `src/setup-state.ts`. Runtime demo data remains local so the browser
bundle does not depend on a sibling repo fixture path. Setup log payloads contain
only metadata such as statuses, providers, update time, and error kinds.

## Google Docs Read-Path Readiness Harness

The local app renders Google Docs read-path readiness states for `SELECTION` and
`ACTIVE_RESOURCE`. It shows active, missing, revoked, and expired consent,
normalized metadata such as content hash, revision, provenance, trust level, and
truncation state, plus safe reconnect-required and permission-failure messages.

The UI intentionally renders metadata only for normalized context. It does not
render raw document text or selected text in the readiness cards, and its safe
log event contains only scenario ID, mode, consent status, connector status,
failure code, provenance trust level, and truncation status.

Tests import the real Google Docs read-path fixtures from
`ai-assist-contracts` and validate the web mapper against the shared connector
and normalized-context shapes.

## Real-Flow UX Hardening Harness

The local app renders backend-shaped client state for the trusted-user flow:
product session, Google connect/callback/disconnect routes, platform provider
availability, document readiness, command creation, SSE stream URL, action
decision, and apply-action. The helper is configurable for real HTTP/SSE base
URLs while default tests remain deterministic and fake-backed.

The UI covers loading, retry, empty, disabled, permission or conflict style
blocked states, safe retry guidance, and metadata-only client logs. Platform
provider availability is the default setup path; BYO provider-key cards remain
optional fallback state only.

For deployed-shaped validation, set Vite runtime env values before starting or
building the frontend. Defaults keep local tests fake-backed and point at
`http://localhost:8787`.

```sh
VITE_API_BASE_URL=https://api.dev.example.test \
VITE_SSE_BASE_URL=https://events.dev.example.test \
VITE_DEMO_SESSION_ID=session_dev \
npm run dev
```

Without overrides, the deployed route templates are:

- setup status: `/setup/status`
- Google OAuth: `/oauth/google/start`, `/oauth/google/callback`,
  `/oauth/google/connection`
- durable session refresh: `/resource-sessions/{sessionId}`
- command creation: `/resource-sessions/{sessionId}/commands`
- action decision: `/resource-sessions/{sessionId}/actions/{actionId}/{decision}`
- apply-action: `/resource-sessions/{sessionId}/apply-action`
- SSE stream: `/sessions/{sessionId}/events`

Optional route overrides are available without code changes:

- `VITE_SETUP_STATUS_PATH`
- `VITE_GOOGLE_CONNECT_PATH`
- `VITE_GOOGLE_CALLBACK_PATH`
- `VITE_GOOGLE_DISCONNECT_PATH`
- `VITE_RESOURCE_SESSION_PATH`
- `VITE_COMMAND_CREATE_PATH`
- `VITE_ACTION_DECISION_PATH`
- `VITE_ACTION_APPLY_PATH`
- `VITE_SESSION_STREAM_PATH`

The default paths intentionally do not include `/api` aliases; local proxy or
hosting rewrites must adapt to these product routes rather than changing the
frontend contract. The default SSE path is `/sessions/{sessionId}/events`,
matching the M9 long-lived browser `EventSource` route shape. After reconnect,
duplicate event, malformed event, or sequence gap, the UI directs the user to
refresh durable session state over HTTP before applying changes.

`src/session-stream.ts` also exposes a fetch-based deployed-route SSE helper for
tests and future browser wiring that need explicit reconnect headers. It sends
`Last-Event-ID` when a reconnect cursor exists, incrementally parses
deployed-shaped `text/event-stream` frames containing full `SessionEvent`
envelopes, suppresses duplicate event IDs across reconnect state, and preserves
the last successfully applied event ID when a malformed frame forces
durable-state refresh guidance.

For deployed dogfood checks, keep `VITE_API_BASE_URL` aligned with
`AI_ASSIST_API_BASE_URL` from `ai-assist-integration-tests/scripts/run-live-smoke`
and keep `VITE_SSE_BASE_URL` aligned with `AI_ASSIST_SSE_BASE_URL`. This lets
the browser shell and opt-in smoke target the same HTTP and SSE surfaces while
unit tests stay fake-backed by default.

## Task Breakdown

Implementation tasks are tracked in [TASKS.md](TASKS.md). Update the checkboxes there in the same change that implements or verifies a task.

## Testing And Coverage

Use Node `^20.19.0 || >=22.12.0`; this matches the locked Vite toolchain.

Install dependencies with repo-local npm:

```sh
npm install
```

Run the unit tests:

```sh
npm test
```

Run the production build:

```sh
npm run build
```

Run the local dev server:

```sh
npm run dev
```

View the coverage report in the terminal:

```sh
npm run coverage
```

Coverage, dependency, and build output paths are ignored by `.gitignore`.
