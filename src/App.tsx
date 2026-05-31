import type { ReactElement } from "react";
import { CONTEXT_MODE_IDS, getContextModeOptions } from "./context-modes";
import { getOnboardingProgress } from "./onboarding-state";
import { getProposedActionState } from "./proposed-actions";
import { MODEL_PROVIDERS, getProviderSetupStatus } from "./provider-setup";
import { createInitialSessionState, reduceSessionEvent } from "./session-events";

const onboarding = getOnboardingProgress({
  isSignedIn: true,
  hasGoogleConnection: true,
  providerStatus: "READY",
  hasResourceSession: false
});

const contextModes = getContextModeOptions({
  activeResourceConnected: true,
  consentedModes: [CONTEXT_MODE_IDS.ACTIVE_RESOURCE]
});

const providerStatus = getProviderSetupStatus({
  provider: MODEL_PROVIDERS.OPENAI,
  validationStatus: "VALID",
  fingerprint: "fp_123",
  expiresAt: "8 hours"
});

const proposedAction = getProposedActionState({
  actionId: "action-1",
  status: "PROPOSED"
});

const sessionState = [
  {
    eventId: "evt-1",
    type: "transport.connected"
  },
  {
    eventId: "evt-2",
    type: "progress",
    message: "Context preview ready"
  },
  {
    eventId: "evt-3",
    type: "assistant.delta",
    messageId: "msg-1",
    delta: "I can help revise the selected paragraph."
  }
].reduce(reduceSessionEvent, createInitialSessionState());

export function App(): ReactElement {
  return (
    <main className="shell" aria-labelledby="app-title">
      <section className="topbar">
        <div>
          <p className="eyebrow">Trusted MVP</p>
          <h1 id="app-title">AI Assist</h1>
        </div>
        <span className="status-pill">React + Vite</span>
      </section>

      <section className="layout" aria-label="Application shell preview">
        <aside className="panel">
          <h2>Onboarding</h2>
          <ol className="steps">
            {onboarding.steps.map((step) => (
              <li className={step.state} key={step.id}>
                {step.label}
              </li>
            ))}
          </ol>
        </aside>

        <section className="workspace">
          <div className="toolbar" aria-label="Context mode">
            {contextModes.map((mode) => (
              <button
                className={mode.mode === CONTEXT_MODE_IDS.SELECTION ? "selected" : undefined}
                disabled={!mode.enabled}
                key={mode.mode}
                title={mode.disabledReason ?? mode.description}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>

          <article className="chat-card">
            <p className="label">Session</p>
            <h2>Google Docs writing workflow</h2>
            <p className="body-copy">
              TypeScript shell for onboarding, context consent, provider setup,
              streamed assistant events, and proposed-action review.
            </p>
            <dl className="status-grid">
              <div>
                <dt>Provider</dt>
                <dd>{providerStatus.label}: {providerStatus.state}</dd>
              </div>
              <div>
                <dt>Stream</dt>
                <dd>{sessionState.connection}</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>{sessionState.progress.at(-1)?.message ?? "Idle"}</dd>
              </div>
            </dl>
          </article>

          <article className="action-card">
            <div>
              <p className="label">Proposed action</p>
              <strong>Replace selected text</strong>
              <p className="action-status">{proposedAction.label}</p>
            </div>
            <div className="actions">
              <button disabled={!proposedAction.canReject} type="button">Reject</button>
              <button className="primary" disabled={!proposedAction.canApprove} type="button">Approve</button>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
