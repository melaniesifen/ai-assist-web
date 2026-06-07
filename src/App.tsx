import { type ReactElement, useMemo, useState } from "react";
import { describeGoogleDocsExtensionSurface } from "./extension-surface";
import {
  DEMO_DOCUMENT_URL,
  DEMO_REVIEW_FIXTURES,
  M2_SESSION_ID,
  applyReviewCard,
  approveAllReviewCards,
  approveReviewCard,
  closeAssistantShell,
  createAssistantShellState,
  createContentScriptBridgeViewModel,
  createInitialMockChatState,
  createMockApplyResult,
  createReviewCardsFromFixtures,
  getApproveAllState,
  getM2ContextModeOptions,
  openAssistantShell,
  rejectReviewCard,
  resolveApplyResult,
  submitMockChatMessage,
  type AssistantShellState,
  type ReviewCardViewModel
} from "./m2-assistant-demo";
import {
  createFirstRunSetupViewModel,
  createSetupDemoStates,
  createSetupStatusCoverageFixtures,
  getStatusCoverageLabels,
  safeSetupLogExcludesForbiddenContent,
  type FirstRunSetupViewModel,
  type SetupCardViewModel
} from "./setup-state";
import {
  createGoogleDocsReadinessDemoStates,
  createGoogleDocsReadinessViewModel,
  safeContextReadinessLogExcludesForbiddenContent,
  type GoogleDocsReadinessViewModel
} from "./context-readiness";

const EMPTY_CHAT_INPUT = "";

export function App(): ReactElement {
  const extensionSurface = useMemo(() => describeGoogleDocsExtensionSurface({ url: DEMO_DOCUMENT_URL }), []);
  const initialShell = useMemo(
    () =>
      createAssistantShellState(
        createContentScriptBridgeViewModel({
          supportState: extensionSurface.state,
          documentId: extensionSurface.documentId,
          url: DEMO_DOCUMENT_URL
        })
      ),
    [extensionSurface.documentId, extensionSurface.state]
  );
  const [shellState, setShellState] = useState<AssistantShellState>(initialShell);
  const [reviewCards, setReviewCards] = useState<ReviewCardViewModel[]>(() => createReviewCardsFromFixtures(DEMO_REVIEW_FIXTURES));
  const [chatState, setChatState] = useState(createInitialMockChatState);
  const [chatInput, setChatInput] = useState(EMPTY_CHAT_INPUT);
  const setupScenarios = useMemo(() => createSetupDemoStates().map(createFirstRunSetupViewModel), []);
  const setupCoverageLabels = useMemo(() => getStatusCoverageLabels(createSetupStatusCoverageFixtures()), []);
  const readPathReadinessScenarios = useMemo(
    () => createGoogleDocsReadinessDemoStates().map(createGoogleDocsReadinessViewModel),
    []
  );
  const contextModes = getM2ContextModeOptions();
  const approveAllState = getApproveAllState(reviewCards);
  const selectedContextMode = contextModes.find((mode) => mode.mode === "SELECTION");
  const activeResourceMode = contextModes.find((mode) => mode.mode === "ACTIVE_RESOURCE");
  const latestCommand = reviewCards.reduce<ReviewCardViewModel["lastCommand"]>(
    (command, card) => card.lastCommand ?? command,
    null
  );

  function updateCard(actionId: string, updater: (card: ReviewCardViewModel) => ReviewCardViewModel): void {
    setReviewCards((cards) => cards.map((card) => (card.actionId === actionId ? updater(card) : card)));
  }

  function submitChat(): void {
    setChatState((state) => submitMockChatMessage(state, chatInput));
    setChatInput(EMPTY_CHAT_INPUT);
  }

  function closePanel(): void {
    setShellState((state) => closeAssistantShell(state));
    setChatState(createInitialMockChatState());
    setChatInput(EMPTY_CHAT_INPUT);
  }

  return (
    <main className="sidepanel-demo" aria-labelledby="app-title">
      <section className="document-preview" aria-label="Google Docs content-script bridge preview">
        <header className="document-header">
          <div>
            <p className="eyebrow">Google Docs content-script bridge</p>
            <h1 id="app-title">{shellState.bridge.title}</h1>
          </div>
          <dl className="doc-meta" aria-label="Current document metadata">
            <div>
              <dt>Document ID</dt>
              <dd>{shellState.bridge.documentId ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{shellState.bridge.resourceRevision}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{shellState.bridge.source}</dd>
            </div>
          </dl>
        </header>

        <article className="document-body" aria-label="Document preview">
          <p>
            This is a local Google Docs-style host preview. The assistant UI runs as a browser side panel and receives
            metadata from the modeled content-script bridge.
          </p>
          <p>
            The browser surface does not call provider APIs, OAuth endpoints, secret storage, or Google Docs mutation
            APIs. Proposed edits stay review-only until a backend-shaped apply result is mocked.
          </p>
        </article>

        <section className="setup-harness" aria-label="First-run setup harness">
          <header className="setup-header">
            <div>
              <p className="eyebrow">M3 first-run setup</p>
              <h2>Backend-shaped setup states</h2>
            </div>
            <span className="context-pill">Default context: SELECTION</span>
          </header>

          <div className="setup-scenarios">
            {setupScenarios.map((scenario) => (
              <SetupScenario key={`${scenario.productSession.status}-${scenario.googleOAuth.status}`} scenario={scenario} />
            ))}
          </div>

          <section className="setup-coverage" aria-label="M3 setup status coverage">
            <h3>Status coverage</h3>
            <ul>
              {setupCoverageLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </section>
        </section>

        <section className="context-readiness-harness" aria-label="M4 Google Docs read-path readiness">
          <header className="setup-header">
            <div>
              <p className="eyebrow">M4 Google Docs read path</p>
              <h2>Context readiness and consent states</h2>
            </div>
            <span className="context-pill">Modes: SELECTION + ACTIVE_RESOURCE</span>
          </header>

          <div className="readiness-grid">
            {readPathReadinessScenarios.map((scenario) => (
              <ReadinessScenario key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </section>

        {!shellState.panelOpen ? (
          <button
            className="primary open-panel-button"
            disabled={!shellState.panelAvailable}
            onClick={() => setShellState((state) => openAssistantShell(state))}
            type="button"
          >
            Open side panel
          </button>
        ) : null}
      </section>

      {shellState.panelOpen ? (
        <aside className="assistant-sidepanel" aria-label="AI assistant side panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Assistant side panel</p>
              <h2>Document review</h2>
            </div>
            <button aria-label="Close assistant side panel" className="icon-button" onClick={closePanel} type="button">
              X
            </button>
          </header>

          <section className="panel-section metadata-strip" aria-label="Session metadata">
            <dl>
              <div>
                <dt>Doc</dt>
                <dd>{shellState.bridge.documentId ?? "Missing"}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{M2_SESSION_ID}</dd>
              </div>
              <div>
                <dt>Context</dt>
                <dd>{selectedContextMode?.label ?? "Selection"}</dd>
              </div>
            </dl>
          </section>

          <section className="panel-section context-modes" aria-label="Context mode">
            {contextModes.map((mode) => (
              <button
                className={mode.mode === "SELECTION" ? "selected" : undefined}
                disabled={!mode.enabled}
                key={mode.mode}
                title={mode.disabledReason ?? mode.description}
                type="button"
              >
                {mode.label}
              </button>
            ))}
            <p className="mode-note">
              {activeResourceMode?.enabled ? "Active resource is available from the bridge metadata." : activeResourceMode?.disabledReason}
            </p>
          </section>

          <section className="panel-section chat-box" aria-label="Mocked assistant chat">
            <div className="message-list">
              {chatState.messages.length === 0 ? (
                <p className="empty-state">Submit a mocked request to show local progress and response state.</p>
              ) : (
                chatState.messages.map((message) => (
                  <p className={`message ${message.role}`} key={message.id}>
                    <span>{message.role}</span>
                    {message.content}
                  </p>
                ))
              )}
            </div>
            {chatState.progress ? <p className="progress-line">{chatState.progress}</p> : null}
            <form
              className="chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitChat();
              }}
            >
              <label className="sr-only" htmlFor="mock-chat-input">Mock prompt</label>
              <input
                id="mock-chat-input"
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about the selected text"
                value={chatInput}
              />
              <button className="primary" type="submit">Send</button>
            </form>
          </section>

          <section className="panel-section review-toolbar" aria-label="Review controls">
            <div>
              <h3>Proposed edits</h3>
              <p>{approveAllState.reason ?? "Approve all is available for safe non-overlapping proposals."}</p>
            </div>
            <button
              className="primary"
              disabled={!approveAllState.enabled}
              onClick={() => setReviewCards((cards) => approveAllReviewCards(cards))}
              type="button"
            >
              Approve all
            </button>
          </section>

          <section className="review-list" aria-label="Proposed edit review cards">
            {reviewCards.map((card) => (
              <article className={`review-card ${card.status.toLowerCase()}`} key={card.actionId}>
                <header className="review-card-header">
                  <div>
                    <p className="action-id">{card.actionId}</p>
                    <h3>{card.actionType === "INSERT_TEXT" ? "Insert text" : "Replace text"}</h3>
                  </div>
                  <span className="status-badge">{card.pendingApplyCommand ? "Apply requested" : card.statusLabel}</span>
                </header>

                <div className="diff-box" aria-label={`Diff for ${card.actionId}`}>
                  {card.targetText ? <p className="removed">- {card.targetText}</p> : null}
                  <p className="added">+ {card.replacementText}</p>
                </div>

                <dl className="review-details">
                  <div>
                    <dt>Context</dt>
                    <dd>{card.surroundingContext}</dd>
                  </div>
                  <div>
                    <dt>Rationale</dt>
                    <dd>{card.rationale}</dd>
                  </div>
                </dl>

                {card.conflict ? (
                  <div className="conflict-box" role="status">
                    <strong>{card.conflict.title}</strong>
                    <p>{card.conflict.message}</p>
                  </div>
                ) : null}

                {card.lastCommand ? (
                  <div className="command-box" aria-label="Last backend-shaped command">
                    <span>{card.lastCommand.commandType}</span>
                    {card.lastCommand.idempotencyKey ? <code>{card.lastCommand.idempotencyKey}</code> : null}
                  </div>
                ) : null}

                {card.duplicateNotice ? <p className="duplicate-note">{card.duplicateNotice}</p> : null}

                <div className="card-actions">
                  <button disabled={!card.canReject} onClick={() => updateCard(card.actionId, rejectReviewCard)} type="button">
                    Reject
                  </button>
                  <button disabled={!card.canApprove} onClick={() => updateCard(card.actionId, approveReviewCard)} type="button">
                    Approve
                  </button>
                  <button className="primary" disabled={!card.canApply} onClick={() => updateCard(card.actionId, applyReviewCard)} type="button">
                    Apply
                  </button>
                  <button
                    disabled={card.pendingApplyCommand === null}
                    onClick={() => updateCard(card.actionId, (current) => resolveApplyResult(current, createMockApplyResult(current)))}
                    type="button"
                  >
                    Mock result
                  </button>
                </div>
              </article>
            ))}
          </section>

          {latestCommand ? (
            <footer className="panel-footer">
              Last command: {latestCommand.commandType}
              {latestCommand.idempotencyKey ? ` with ${latestCommand.idempotencyKey}` : ""}
            </footer>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}

function ReadinessScenario({ scenario }: { scenario: GoogleDocsReadinessViewModel }): ReactElement {
  return (
    <article className={`readiness-card ${scenario.tone}`}>
      <header className="readiness-header">
        <div>
          <h3>{scenario.title}</h3>
          <p>{scenario.contextLabel}</p>
        </div>
        <span className={`status-badge ${scenario.tone === "ready" ? "ready" : "blocked"}`}>
          {scenario.tone === "ready" ? "Ready" : "Blocked"}
        </span>
      </header>

      <dl className="readiness-summary">
        <div>
          <dt>Consent</dt>
          <dd>{scenario.consentLabel}</dd>
        </div>
        <div>
          <dt>Safe log</dt>
          <dd>{safeContextReadinessLogExcludesForbiddenContent(scenario.safeLogEvent) ? "metadata only" : "blocked"}</dd>
        </div>
      </dl>

      <p className="readiness-message">{scenario.userMessage}</p>
      <p className="readiness-consent">{scenario.consentMessage}</p>

      {scenario.failure ? (
        <div className="readiness-failure" role="status">
          <strong>{scenario.failure.code}</strong>
          <p>{scenario.failure.message}</p>
        </div>
      ) : null}

      {scenario.metadata.length > 0 ? (
        <dl className="readiness-metadata" aria-label={`${scenario.title} normalized metadata`}>
          {scenario.metadata.map((item) => (
            <div key={`${scenario.id}-${item.label}`}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

function SetupScenario({ scenario }: { scenario: FirstRunSetupViewModel }): ReactElement {
  return (
    <article className={`setup-scenario ${scenario.ready ? "ready" : "needs-action"}`}>
      <header className="scenario-header">
        <div>
          <h3>{scenario.ready ? "Ready setup" : "Needs user action"}</h3>
          <p>{scenario.ready ? "Login, Google, provider, and resource-session states are ready." : "Safe UI errors show what must be fixed."}</p>
        </div>
        <span className={`status-badge ${scenario.ready ? "ready" : "blocked"}`}>{scenario.ready ? "Ready" : "Blocked"}</span>
      </header>

      <div className="setup-card-grid">
        <SetupCard card={scenario.productSession} />
        <SetupCard card={scenario.googleOAuth} />
        {scenario.providerSecrets.map((provider) => (
          <SetupCard card={provider} key={provider.id} />
        ))}
        <SetupCard card={scenario.resourceSession} />
      </div>

      {scenario.errors.length > 0 ? (
        <div className="setup-errors" role="status">
          {scenario.errors.map((error) => (
            <p key={`${error.kind}-${error.code ?? "unknown"}`}>
              <strong>{error.kind}</strong>
              {error.message}
            </p>
          ))}
        </div>
      ) : null}

      <dl className="safe-log">
        <div>
          <dt>Safe log payload</dt>
          <dd>{safeSetupLogExcludesForbiddenContent(scenario.safeLogEvent) ? "metadata only" : "blocked"}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{scenario.updatedAt}</dd>
        </div>
      </dl>
    </article>
  );
}

function SetupCard({ card }: { card: SetupCardViewModel }): ReactElement {
  return (
    <article className={`setup-card ${card.tone}`}>
      <header>
        <span>{card.label}</span>
        <strong>{card.status}</strong>
      </header>
      <p>{card.message}</p>
      {card.metadata.length > 0 ? (
        <dl>
          {card.metadata.map((item) => (
            <div key={`${card.id}-${item.label}`}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
