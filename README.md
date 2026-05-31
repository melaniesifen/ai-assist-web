# ai-assist-web

Static, dependency-light frontend bootstrap for the AI Assist Platform.

This repo currently provides a framework-ready browser shell plus pure UI/state
helpers tested with `node:test`. It does not create a React or Next.js app yet.
That keeps the first slice reviewable and avoids network installs while the
contracts and service repos are still stabilizing.

## Current Contents

- `index.html`: minimal static shell that can be opened directly from disk.
- `src/onboarding-state.js`: onboarding step derivation for auth, Google,
  provider setup, and resource session readiness.
- `src/context-modes.js`: context mode labels and availability state.
- `src/provider-setup.js`: provider credential setup state for OpenAI,
  Anthropic, and future Bedrock mode.
- `src/session-events.js`: reducer for SSE-style session events.
- `src/proposed-actions.js`: user-facing proposed-action state helpers.
- `src/error-mapping.js`: safe error category/code to user-message mapping.
- `test/*.test.js`: contract-oriented unit tests using only Node built-ins.

## Future Amplify and Framework Migration

The architecture recommends AWS Amplify Hosting for the frontend and a future
React or Next.js implementation. This bootstrap is structured so those steps can
reuse the tested helpers:

1. Keep `src/*` helpers pure and move them into framework state/hooks as the UI
   grows.
2. Add generated or packaged schemas from `ai-assist-contracts` before wiring
   real HTTP and SSE clients.
3. Introduce Amplify hosting config in `ai-assist-infra`; keep frontend secrets
   out of build-time and runtime browser config.
4. Replace the static shell with React/Next routes for onboarding, provider
   setup, resource selection, session chat, and action review.

The browser must never receive provider API keys from the backend or call model
providers directly. Provider credentials are user-entered, posted to backend
services, KMS-encrypted as short-lived session secrets, and represented in the UI
only by safe status metadata.

## Task Breakdown

Implementation tasks are tracked in [TASKS.md](TASKS.md). Update the checkboxes there in the same change that implements or verifies a task.

## Testing And Coverage

Run the unit tests with either command:

```sh
node --test
npm test
```

View the built-in coverage report in the terminal:

```sh
node --experimental-test-coverage --test
npm run coverage
```

The coverage command uses Node's built-in test runner and prints a text report. If later tooling writes HTML, LCOV, TAP, JUnit, or build output, those generated paths are ignored by `.gitignore`.
