# ai-assist-web

TypeScript React frontend for the AI Assist Platform.

This repo uses React plus Vite for the browser shell and keeps the core
onboarding, context-mode, provider-status, session-event, proposed-action, and
safe-error behavior in pure TypeScript helpers with unit tests.

## Current Contents

- `index.html`: Vite HTML entrypoint.
- `src/main.tsx`: React root renderer.
- `src/App.tsx`: MVP shell using the tested state helpers.
- `src/onboarding-state.ts`: onboarding step derivation for auth, Google,
  provider setup, and resource session readiness.
- `src/context-modes.ts`: context mode labels and availability state.
- `src/provider-setup.ts`: provider credential setup state for OpenAI,
  Anthropic, and future Bedrock mode.
- `src/session-events.ts`: reducer for SSE-style session events.
- `src/proposed-actions.ts`: user-facing proposed-action state helpers.
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
