# ai-assist-web

TypeScript React frontend for the AI Assist Platform.

This repo uses React plus Vite for the browser shell and keeps the core
onboarding, context-mode, provider-status, session-event, proposed-action, and
safe-error behavior in pure TypeScript helpers with unit tests.

## Current Contents

- `index.html`: Vite HTML entrypoint.
- `src/main.tsx`: React root renderer.
- `src/App.tsx`: sidebar/side-panel M2 demo shell using the tested state helpers.
- `src/onboarding-state.ts`: onboarding step derivation for auth, Google,
  provider setup, and resource session readiness.
- `src/context-modes.ts`: context mode labels and availability state.
- `src/provider-setup.ts`: provider credential setup state for OpenAI,
  Anthropic, and future Bedrock mode.
- `src/session-events.ts`: reducer for SSE-style session events.
- `src/proposed-actions.ts`: user-facing proposed-action state helpers.
- `src/extension-surface.ts`: Google Docs browser-extension MVP surface
  contract for page support, document ID detection, backend ownership, and safe
  user-facing states.
- `src/m2-assistant-demo.ts`: local M2 side-panel demo helpers for content-script
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

## M2 Local Side-Panel Demo

The local M2 demo uses the sidebar/side-panel as the primary UI surface. It
models a Google Docs content-script bridge for document metadata, keeps mocked
chat state in active visible UI state, renders PR-style proposed-edit cards, and
supports approve, reject, approve-all, and apply controls.

The non-demo M2 web-side work is implemented and covered by unit tests. The
remaining M2 validation step is the user-owned local browser demo.

Apply does not mark an action applied from a client click. The Apply control
creates a backend-shaped `actions.apply` command with an idempotency key. A
separate mocked backend-shaped result transitions the card to `APPLIED`,
`FAILED`, or `CONFLICTED`.

Runtime demo data stays contract-compatible without importing sibling fixtures
into the browser bundle. Tests import and validate the real M1 fixtures from
`ai-assist-contracts`.

`src/extension-surface.ts` exposes typed user-facing states:

- `READY`: supported Google Docs document page with a detected document ID.
- `UNSUPPORTED_PAGE`: no assistant injection because the page is outside the
  supported Google Docs document surface.
- `MISSING_DOCUMENT_ID`: Google Docs page shape is recognized, but no usable
  document ID is available.

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
