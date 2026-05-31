# AGENTS.md

## Repo Purpose

`ai-assist-web` owns the user-facing onboarding, provider setup, resource selection, chat/session UI, SSE client behavior, context controls, proposed-action review, and safe error display.

## Agent Instructions

- Read `README.md`, `ai-assist-platform-context.md`, and the frontend sections in `../ai-assist-architecture/ai-workflow-assistant-platform-architecture-spec.md` before changing behavior.
- Do not put provider API keys, OAuth tokens, bearer tokens, prompts, selected text, document text, model responses, screenshots, or action payloads in client logs.
- Do not call model providers or Google APIs directly from the frontend.
- Make context scope visible and default MVP behavior to `SELECTION`.
- Keep future modes disabled unless backend support and consent flows exist.
- All write-back UI must go through proposed-action approval/apply flows; never direct mutation.
- Add tests for state reducers, context labels, provider status, safe error mapping, event deduplication, and proposed-action status transitions.
- Use the React plus Vite TypeScript stack unless the parent/user explicitly approves a different frontend framework.

## Commands

- Use Node `^20.19.0 || >=22.12.0`.
- Install dependencies with `npm install`.
- Run tests with `npm test`.
- Run coverage with `npm run coverage`.
- Run production build checks with `npm run build`.
- Run the local frontend with `npm run dev`.

## Review Notes

Before committing, review for sensitive client-side exposure, misleading consent UX, action state drift, and raw backend error leakage to users.

## Commit Messages

All commits in this repo must use this format:

```text
docs/feat/fix/(or another appropriate type): title of change

problem: <description of problem>
solution: <description of solution>
impact: <impact of this change>
reference: <reference to this change in the docs if applicable>
```
