import { type FormEvent, type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { describeGoogleDocsExtensionSurface } from "./extension-surface";
import {
  DEMO_DOCUMENT_URL,
  DEMO_REVIEW_FIXTURES,
  ASSISTANT_DEMO_SESSION_ID,
  applyReviewCard,
  approveAllReviewCards,
  approveReviewCard,
  closeAssistantShell,
  createAssistantShellState,
  createContentScriptBridgeViewModel,
  createInitialMockChatState,
  createMockApplyResponse,
  createMockApplyResponseWithResult,
  createMockApplyResult,
  createReviewCardsFromFixtures,
  getApproveAllState,
  getAssistantDemoContextModeOptions,
  openAssistantShell,
  reconcileReviewCardStatusEvent,
  rejectReviewCard,
  resolveApplyResult,
  submitMockChatMessage,
  type AssistantShellState,
  type ReviewCardViewModel
} from "./assistant-demo";
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
import {
  createAcceptedCommandView,
  createInitialSessionStreamClientState,
  createLastEventIdHeaders,
  createSessionStreamDemoFrames,
  fetchSessionStreamRoute,
  getSessionStreamRefreshGuidance,
  reduceSseFrame,
  safeSessionStreamLogExcludesForbiddenContent,
  type SessionStreamClientState,
  type SessionStreamRouteFetch
} from "./session-stream";
import { type ProposedActionView } from "./session-events";
import {
  createSessionStreamUrl,
  createRealFlowClientStateFromRuntimeEnv,
  createRealFlowClientViewModel,
  safeRealFlowLogExcludesForbiddenContent,
  type RealFlowClientViewModel
} from "./real-flow-client";
import {
  createExtensionDogfoodCommandAuthProvider,
  safeDogfoodCommandLogExcludesForbiddenContent,
  submitDogfoodCommand,
  type DogfoodCommandAuthProvider,
  type DogfoodCommandKind,
  type DogfoodCommandResult
} from "./dogfood-command-client";
import {
  ensureDogfoodContextConsent,
  safeDogfoodContextConsentLogExcludesForbiddenContent,
  type DogfoodContextConsentResult
} from "./dogfood-context-consent-client";
import {
  safeDogfoodActionLogExcludesForbiddenContent,
  submitDogfoodActionRoute,
  type DogfoodActionRouteKind,
  type DogfoodActionRouteResult
} from "./dogfood-action-client";
import { type ExtensionRuntimeAuthBridge } from "./product-auth";
import { getProposedActionState } from "./proposed-actions";
import {
  createDogfoodSidebarState,
  safeDogfoodSidebarLogExcludesForbiddenContent,
  type DogfoodSidebarBlocker,
  type DogfoodSidebarContractInput,
  type DogfoodSidebarState,
  type GoogleOAuthStatus,
  type ProductAuthStatus
} from "./dogfood-sidebar-state";

const EMPTY_CHAT_INPUT = "";
const DEFAULT_CONTEXT_STATUS: DogfoodSidebarContractInput["context"] = "idle";
const DEFAULT_PROVIDER_STATUS: DogfoodSidebarContractInput["provider"] = "unknown";
const DEFAULT_COMMAND_STATUS: DogfoodSidebarContractInput["command"] = "idle";
const DEFAULT_STREAM_STATUS: DogfoodSidebarContractInput["stream"] = "disconnected";
const DEFAULT_PROPOSED_ACTIONS_STATUS: DogfoodSidebarContractInput["proposedActions"] = "none";
const DEFAULT_APPLY_STATUS: DogfoodSidebarContractInput["apply"] = "blocked";
const SESSION_STREAM_UNAVAILABLE_MESSAGE = "Session stream is unavailable from this browser session.";
const SESSION_STREAM_AUTH_UNAVAILABLE_MESSAGE = "Session stream auth is unavailable from this browser session.";
const QUICK_COMMANDS = [
  { kind: "summarize", label: "Summarize this doc", prompt: "Summarize this Google Doc." },
  { kind: "suggest_edits", label: "Suggest edits", prompt: "Suggest edits for this Google Doc." }
] as const;

type DogfoodLocalActionRouteState = {
  pendingKind: DogfoodActionRouteKind | null;
  acceptedKind: DogfoodActionRouteKind | null;
};

export function App(): ReactElement {
  const extensionSurface = useMemo(() => describeGoogleDocsExtensionSurface({ url: DEMO_DOCUMENT_URL }), []);
  const dogfoodInput = useMemo(
    () => createDogfoodSidebarInputFromSearch(getRuntimeSearch(), null),
    []
  );
  const dogfoodState = useMemo(() => createDogfoodSidebarState(dogfoodInput), [dogfoodInput]);
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
  const [sessionStreamState, setSessionStreamState] = useState(createInitialSessionStreamClientState);
  const setupScenarios = useMemo(() => createSetupDemoStates().map(createFirstRunSetupViewModel), []);
  const setupCoverageLabels = useMemo(() => getStatusCoverageLabels(createSetupStatusCoverageFixtures()), []);
  const readPathReadinessScenarios = useMemo(
    () => createGoogleDocsReadinessDemoStates().map(createGoogleDocsReadinessViewModel),
    []
  );
  const realFlowClient = useMemo(
    () => createRealFlowClientViewModel(createRealFlowClientStateFromRuntimeEnv(import.meta.env)),
    []
  );
  const sessionStreamFrames = useMemo(createSessionStreamDemoFrames, []);
  const acceptedCommand = useMemo(createAcceptedCommandView, []);
  const contextModes = getAssistantDemoContextModeOptions();
  const approveAllState = getApproveAllState(reviewCards);
  const selectedContextMode = contextModes.find((mode) => mode.mode === "SELECTION");
  const activeResourceMode = contextModes.find((mode) => mode.mode === "ACTIVE_RESOURCE");
  const lastEventHeaders = createLastEventIdHeaders(sessionStreamState.lastEventId);
  const streamRefreshGuidance = getSessionStreamRefreshGuidance(sessionStreamState);
  const streamedProposedActions = Object.values(sessionStreamState.session.proposedActions);
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

  function runSessionStreamDemo(): void {
    setSessionStreamState(sessionStreamFrames.reduce(reduceSseFrame, createInitialSessionStreamClientState()));
  }

  function closePanel(): void {
    setShellState((state) => closeAssistantShell(state));
    setChatState(createInitialMockChatState());
    setChatInput(EMPTY_CHAT_INPUT);
  }

  return (
    <main className="dogfood-app" aria-labelledby="app-title">
      <DogfoodAssistantSurface input={dogfoodInput} state={dogfoodState} />

      <details className="dev-harness-panel">
        <summary>Development diagnostics and deterministic harnesses</summary>
        <div className="sidepanel-demo" aria-label="Development-only harness container">
      <section className="document-preview" aria-label="Google Docs content-script bridge preview">
        <header className="document-header">
          <div>
            <p className="eyebrow">Google Docs content-script bridge</p>
            <h1 id="dev-harness-title">{shellState.bridge.title}</h1>
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
              <p className="eyebrow">First-run setup</p>
              <h2>Backend-shaped setup states</h2>
            </div>
            <span className="context-pill">Default context: SELECTION</span>
          </header>

          <div className="setup-scenarios">
            {setupScenarios.map((scenario, index) => (
              <SetupScenario key={`setup-scenario-${index}-${scenario.updatedAt}`} scenario={scenario} />
            ))}
          </div>

          <section className="setup-coverage" aria-label="First-run setup status coverage">
            <h3>Status coverage</h3>
            <ul>
              {setupCoverageLabels.map((label, index) => (
                <li key={`setup-coverage-${index}-${label}`}>{label}</li>
              ))}
            </ul>
          </section>
        </section>

        <section className="context-readiness-harness" aria-label="Google Docs read-path readiness">
          <header className="setup-header">
            <div>
              <p className="eyebrow">Google Docs read path</p>
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

        <RealFlowClientPanel flow={realFlowClient} />

        <section className="session-stream-harness" aria-label="Session stream harness">
          <header className="setup-header">
            <div>
              <p className="eyebrow">Ask and stream</p>
              <h2>Command and SSE session events</h2>
            </div>
            <button className="primary" onClick={runSessionStreamDemo} type="button">
              Run stream
            </button>
          </header>

          <div className="stream-grid">
            <article className="stream-card">
              <h3>Accepted command</h3>
              <dl className="stream-metadata">
                {Object.entries(acceptedCommand).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>

            <article className="stream-card">
              <h3>Session stream</h3>
              <dl className="stream-metadata">
                <div>
                  <dt>Connection</dt>
                  <dd>{sessionStreamState.session.connection}</dd>
                </div>
                <div>
                  <dt>Last event</dt>
                  <dd>{sessionStreamState.lastEventId ?? "None"}</dd>
                </div>
                <div>
                  <dt>Reconnect</dt>
                  <dd>{sessionStreamState.reconnectRequired ? "Required" : "Not required"}</dd>
                </div>
                <div>
                  <dt>Last-Event-ID</dt>
                  <dd>{lastEventHeaders["Last-Event-ID"] ?? "None"}</dd>
                </div>
                <div>
                  <dt>Refresh guidance</dt>
                  <dd>{streamRefreshGuidance ?? "Not needed"}</dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="stream-grid">
            <article className="stream-card">
              <h3>Progress</h3>
              {sessionStreamState.session.progress.length === 0 ? (
                <p className="empty-state">No streamed progress yet.</p>
              ) : (
                <ul className="stream-list">
                  {sessionStreamState.session.progress.map((progress) => (
                    <li key={progress.eventId ?? progress.message}>{progress.message}</li>
                  ))}
                </ul>
              )}
            </article>

            <article className="stream-card">
              <h3>Assistant output</h3>
              {sessionStreamState.session.messages.length === 0 ? (
                <p className="empty-state">Run the stream to accumulate assistant deltas.</p>
              ) : (
                sessionStreamState.session.messages.map((message) => (
                  <p className={`message ${message.role}`} key={message.messageId}>
                    <span>{message.status}</span>
                    {message.content}
                  </p>
                ))
              )}
            </article>
          </div>

          <article className="stream-card action-stream-card" aria-label="Streamed proposed action states">
            <h3>Proposed actions</h3>
            {streamedProposedActions.length === 0 ? (
              <p className="empty-state">Run the stream to render action proposals and status changes.</p>
            ) : (
              <ul className="stream-list">
                {streamedProposedActions.map((action) => (
                  <li key={action.actionId}>
                    <strong>{action.status}</strong>
                    <span>{action.preview ?? action.actionId}</span>
                    {action.resourceTitle ? <small>{action.resourceTitle}</small> : null}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <div className="stream-grid">
            <article className="stream-card warning">
              <h3>Warnings and errors</h3>
              <p className="empty-state">Malformed frames: {sessionStreamState.malformedFrameCount}</p>
              {sessionStreamState.session.streamWarnings.map((warning) => (
                <p className="stream-warning" key={`${warning.kind}-${warning.eventId ?? "none"}`}>
                  <strong>{warning.kind}</strong>
                  {warning.message}
                </p>
              ))}
              {sessionStreamState.session.errors.map((error) => (
                <p className="stream-error" key={`${error.category}-${error.code}`}>
                  <strong>{error.code}</strong>
                  {error.message}
                </p>
              ))}
            </article>

            <article className="stream-card">
              <h3>Safe client log</h3>
              <dl className="stream-metadata">
                <div>
                  <dt>Event</dt>
                  <dd>{sessionStreamState.safeLogEvent.event}</dd>
                </div>
                <div>
                  <dt>Payload</dt>
                  <dd>{safeSessionStreamLogExcludesForbiddenContent(sessionStreamState.safeLogEvent) ? "metadata only" : "blocked"}</dd>
                </div>
              </dl>
            </article>
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
                <dd>{ASSISTANT_DEMO_SESSION_ID}</dd>
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

                {card.applyDisplay ? (
                  <div className="apply-result-box" role="status">
                    <strong>{card.applyDisplay.title}</strong>
                    <p>{card.applyDisplay.message}</p>
                    {card.applyDisplay.code ? <code>{card.applyDisplay.code}</code> : null}
                  </div>
                ) : null}

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
                    Applied result
                  </button>
                  <button
                    disabled={card.pendingApplyCommand === null}
                    onClick={() =>
                      updateCard(card.actionId, (current) =>
                        resolveApplyResult(
                          current,
                          createMockApplyResponseWithResult(current, {
                            status: "CONFLICTED",
                            replayed: false,
                            conflictReasonCode: "APPLY_TARGET_CONFLICTED"
                          })
                        )
                      )
                    }
                    type="button"
                  >
                    Conflict result
                  </button>
                  <button
                    disabled={card.pendingApplyCommand === null}
                    onClick={() =>
                      updateCard(card.actionId, (current) =>
                        resolveApplyResult(
                          current,
                          createMockApplyResponseWithResult(current, {
                            status: "FAILED",
                            replayed: false,
                            failureCode: "CONNECTOR_WRITE_FAILED"
                          })
                        )
                      )
                    }
                    type="button"
                  >
                    Failed result
                  </button>
                  <button
                    disabled={card.pendingApplyCommand === null}
                    onClick={() =>
                      updateCard(card.actionId, (current) =>
                        resolveApplyResult(
                          current,
                          createMockApplyResponseWithResult(current, {
                            status: "APPLIED",
                            replayed: true
                          })
                        )
                      )
                    }
                    type="button"
                  >
                    Duplicate replay
                  </button>
                  <button
                    disabled={card.pendingApplyCommand === null}
                    onClick={() =>
                      updateCard(card.actionId, (current) =>
                        resolveApplyResult(
                          current,
                          createMockApplyResponse(current, {
                            status: "rejected",
                            result: undefined,
                            error: {
                              category: "AUTHORIZATION",
                              code: "AUTHORIZATION_DENIED",
                              retryable: false
                            }
                          })
                        )
                      )
                    }
                    type="button"
                  >
                    Denied
                  </button>
                  <button
                    disabled={card.pendingApplyCommand === null}
                    onClick={() =>
                      updateCard(card.actionId, (current) =>
                        resolveApplyResult(
                          current,
                          createMockApplyResponse(current, {
                            status: "rejected",
                            result: undefined,
                            error: {
                              category: "OAUTH",
                              code: "OAUTH_RECONNECT_REQUIRED",
                              retryable: false
                            }
                          })
                        )
                      )
                    }
                    type="button"
                  >
                    Reconnect required
                  </button>
                  <button
                    onClick={() =>
                      updateCard(card.actionId, (current) =>
                        reconcileReviewCardStatusEvent(current, {
                          type: "action.status_changed",
                          eventId: `evt-${current.actionId}-expired`,
                          payload: {
                            actionId: current.actionId,
                            previousStatus: current.status,
                            status: "EXPIRED",
                            reasonCode: "ACTION_EXPIRED"
                          }
                        })
                      )
                    }
                    type="button"
                  >
                    Expired event
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
        </div>
      </details>
    </main>
  );
}

export function DogfoodAssistantSurface({
  authProvider,
  initialSessionStreamState,
  input,
  state,
  streamRouteFetcher
}: {
  authProvider?: DogfoodCommandAuthProvider;
  initialSessionStreamState?: SessionStreamClientState;
  input: DogfoodSidebarContractInput;
  state: DogfoodSidebarState;
  streamRouteFetcher?: SessionStreamRouteFetch;
}): ReactElement {
  const [commandPrompt, setCommandPrompt] = useState("");
  const [commandKind, setCommandKind] = useState<DogfoodCommandKind>("custom");
  const [commandResult, setCommandResult] = useState<DogfoodCommandResult | null>(null);
  const [contextConsentResult, setContextConsentResult] = useState<DogfoodContextConsentResult | null>(null);
  const [actionResult, setActionResult] = useState<DogfoodActionRouteResult | null>(null);
  const [dogfoodStreamState, setDogfoodStreamState] = useState<SessionStreamClientState>(
    initialSessionStreamState ?? createInitialSessionStreamClientState
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState<string | null>(null);
  const [streamRefreshing, setStreamRefreshing] = useState(false);
  const [streamConnecting, setStreamConnecting] = useState(false);
  const [streamOpen, setStreamOpen] = useState(false);
  const [contextConsenting, setContextConsenting] = useState(false);
  const [googleReconnecting, setGoogleReconnecting] = useState(false);
  const [googleReconnectMessage, setGoogleReconnectMessage] = useState<string | null>(null);
  const [streamRefreshError, setStreamRefreshError] = useState<string | null>(null);
  const [actionRouteStates, setActionRouteStates] = useState<Record<string, DogfoodLocalActionRouteState>>({});
  const contextConsentAttemptKey = useRef<string | null>(null);
  const streamAbortController = useRef<AbortController | null>(null);
  const latestStreamState = useRef(dogfoodStreamState);
  const sidebarInput = useMemo(
    () =>
      contextConsentResult?.status === "granted" && input.context === "consent_required"
        ? {
            ...input,
            context: "ready" as const
          }
        : input,
    [contextConsentResult?.status, input]
  );
  const sidebarState = useMemo(
    () => (sidebarInput === input ? state : createDogfoodSidebarState(sidebarInput)),
    [input, sidebarInput, state]
  );
  const setupBlockers = sidebarState.blockers.filter((blocker) => ["auth", "google", "document"].includes(blocker.area));
  const commandBlockers = sidebarState.blockers.filter((blocker) => ["auth", "google", "document", "context", "provider", "command"].includes(blocker.area));
  const firstBlockingDependency = commandBlockers[0];
  const proposedActions = Object.values(dogfoodStreamState.session.proposedActions);
  const canSubmit = sidebarState.canSubmitCommand && !submitting;
  const commandPlaceholder = sidebarState.canSubmitCommand
    ? "Ask for a summary or edit suggestions"
    : firstBlockingDependency?.message ?? "Refresh readiness before submitting";
  const canEnsureContextConsent =
    input.context === "consent_required" &&
    input.productAuth === "signed_in" &&
    input.googleOAuth === "connected" &&
    Boolean(sidebarState.activeDocumentId);
  const shouldAutoEnsureContextConsent =
    canEnsureContextConsent && contextConsentResult?.status !== "granted" && contextConsentResult?.status !== "dependency_error";

  useEffect(() => {
    latestStreamState.current = dogfoodStreamState;
  }, [dogfoodStreamState]);

  useEffect(() => {
    if (!shouldAutoEnsureContextConsent || contextConsenting || !sidebarState.activeDocumentId) {
      return;
    }

    const attemptKey = `${getRuntimeEnvValue("VITE_DEMO_SESSION_ID", "session_dogfood_sidebar")}:${sidebarState.activeDocumentId}`;
    if (contextConsentAttemptKey.current === attemptKey) {
      return;
    }
    contextConsentAttemptKey.current = attemptKey;
    void ensureContextConsent();
  }, [contextConsenting, shouldAutoEnsureContextConsent, sidebarState.activeDocumentId]);

  useEffect(() => {
    if (!sidebarState.canOpenStream) {
      streamAbortController.current?.abort();
      streamAbortController.current = null;
      setStreamConnecting(false);
      setStreamRefreshing(false);
      setStreamOpen(false);
      return;
    }

    if (streamAbortController.current) {
      return;
    }

    void openSessionStream({ manual: false });

    return () => {
      streamAbortController.current?.abort();
      streamAbortController.current = null;
      setStreamConnecting(false);
      setStreamRefreshing(false);
      setStreamOpen(false);
    };
  }, [authProvider, sidebarState.canOpenStream, streamRouteFetcher]);

  async function submitCommand(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setCommandResult(null);

    try {
      const result = await submitDogfoodCommand(
        {
          prompt: commandPrompt,
          commandKind,
          httpBaseUrl: getRuntimeEnvValue("VITE_API_BASE_URL", "http://localhost:8787"),
          sessionId: getRuntimeEnvValue("VITE_DEMO_SESSION_ID", "session_dogfood_sidebar"),
          activeDocumentId: sidebarState.activeDocumentId,
          sidebarState,
          commandPathTemplate: getRuntimeEnvValue("VITE_COMMAND_CREATE_PATH", "/resource-sessions/{sessionId}/commands")
        },
        {
          authProvider: authProvider ?? createRuntimeDogfoodAuthProvider()
        }
      );
      setCommandResult(result);
    } finally {
      setSubmitting(false);
    }
  }

  async function ensureContextConsent(): Promise<void> {
    setContextConsenting(true);
    setContextConsentResult(null);
    try {
      const result = await ensureDogfoodContextConsent(
        {
          httpBaseUrl: getRuntimeEnvValue("VITE_API_BASE_URL", "http://localhost:8787"),
          sessionId: getRuntimeEnvValue("VITE_DEMO_SESSION_ID", "session_dogfood_sidebar"),
          activeDocumentId: sidebarState.activeDocumentId,
          contextConsentPathTemplate: getRuntimeEnvValue("VITE_CONTEXT_CONSENT_PATH", "/resource-sessions/{sessionId}/context-consent")
        },
        {
          authProvider: authProvider ?? createRuntimeDogfoodAuthProvider()
        }
      );
      setContextConsentResult(result);
    } finally {
      setContextConsenting(false);
    }
  }

  async function submitActionRoute(kind: DogfoodActionRouteKind, action: ProposedActionView): Promise<void> {
    setActionSubmitting(`${kind}:${action.actionId}`);
    setActionResult(null);
    setActionRouteStates((current) => ({
      ...current,
      [action.actionId]: {
        pendingKind: kind,
        acceptedKind: current[action.actionId]?.acceptedKind ?? null
      }
    }));

    try {
      const result = await submitDogfoodActionRoute(
        {
          kind,
          httpBaseUrl: getRuntimeEnvValue("VITE_API_BASE_URL", "http://localhost:8787"),
          sessionId: action.sessionId ?? "",
          actionId: action.actionId,
          actionStatus: action.status,
          sidebarState,
          decisionPathTemplate: getRuntimeEnvValue("VITE_ACTION_DECISION_PATH", "/resource-sessions/{sessionId}/actions/{actionId}/{decision}"),
          applyPathTemplate: getRuntimeEnvValue("VITE_ACTION_APPLY_PATH", "/resource-sessions/{sessionId}/apply-action")
        },
        {
          authProvider: authProvider ?? createRuntimeDogfoodAuthProvider()
        }
      );
      setActionResult(result);
      setActionRouteStates((current) => ({
        ...current,
        [action.actionId]: {
          pendingKind: null,
          acceptedKind: result.status === "accepted" ? kind : current[action.actionId]?.acceptedKind ?? null
        }
      }));
    } finally {
      setActionSubmitting(null);
      setActionRouteStates((current) => ({
        ...current,
        [action.actionId]: {
          pendingKind: null,
          acceptedKind: current[action.actionId]?.acceptedKind ?? null
        }
      }));
    }
  }

  async function refreshSessionState(): Promise<void> {
    streamAbortController.current?.abort();
    streamAbortController.current = null;
    setStreamOpen(false);
    await openSessionStream({ manual: true });
  }

  async function openSessionStream({ manual }: { manual: boolean }): Promise<void> {
    if (manual) {
      setStreamRefreshing(true);
    } else {
      setStreamConnecting(true);
    }
    setStreamRefreshError(null);
    const abortController = new AbortController();
    streamAbortController.current = abortController;
    try {
      const authorization = await resolveStreamAuthorization(authProvider ?? createRuntimeDogfoodAuthProvider());
      const fetcher = createAuthorizedStreamFetcher(authorization, streamRouteFetcher);
      const result = await fetchSessionStreamRoute({
        streamUrl: createSessionStreamUrl(
          getRuntimeEnvValue("VITE_SSE_BASE_URL", getRuntimeEnvValue("VITE_API_BASE_URL", "http://localhost:8787")),
          getRuntimeEnvValue("VITE_SESSION_STREAM_PATH", "/sessions/{sessionId}/events"),
          getRuntimeEnvValue("VITE_DEMO_SESSION_ID", "session_dogfood_sidebar")
        ),
        lastEventId: latestStreamState.current.lastEventId,
        initialState: latestStreamState.current,
        fetcher,
        onResponse: (response) => {
          if (streamAbortController.current !== abortController) {
            return;
          }
          setStreamRefreshing(false);
          setStreamConnecting(false);
          setStreamOpen(response.ok);
          if (!response.ok) {
            setStreamRefreshError(formatSessionStreamHttpError(response.status, response.contentType));
          }
        },
        onState: (nextState) => {
          if (streamAbortController.current === abortController) {
            setDogfoodStreamState(nextState);
          }
        },
        signal: abortController.signal
      });
      if (streamAbortController.current !== abortController) {
        return;
      }
      setDogfoodStreamState(result.state);
      if (!result.ok) {
        setStreamRefreshError(formatSessionStreamHttpError(result.status, result.contentType));
        setStreamOpen(false);
      }
    } catch (error) {
      if (streamAbortController.current !== abortController) {
        return;
      }
      if (!isAbortError(error)) {
        setStreamRefreshError(formatSessionStreamTransportError(error));
      }
      setStreamOpen(false);
    } finally {
      if (streamAbortController.current === abortController) {
        streamAbortController.current = null;
        if (manual) {
          setStreamRefreshing(false);
        } else {
          setStreamConnecting(false);
        }
      }
    }
  }

  async function reconnectGoogleOAuth(): Promise<void> {
    const runtime = getBrowserExtensionRuntime();
    if (!runtime?.sendMessage) {
      setGoogleReconnectMessage("Google reconnect is available from the browser extension.");
      return;
    }

    setGoogleReconnecting(true);
    setGoogleReconnectMessage(null);
    try {
      const response = (await runtime.sendMessage({ type: "AI_ASSIST_GOOGLE_RECONNECT" })) as {
        ok?: boolean;
        error?: string;
        googleOAuth?: { status?: string; message?: string; displayName?: string };
      };
      if (!response?.ok) {
        setGoogleReconnectMessage(response?.error ?? "Google reconnect did not start.");
        return;
      }
      setContextConsentResult(null);
      setGoogleReconnectMessage(response.googleOAuth?.message ?? response.googleOAuth?.displayName ?? "Google authorization is open.");
    } catch {
      setGoogleReconnectMessage("Google reconnect did not start from this browser session.");
    } finally {
      setGoogleReconnecting(false);
    }
  }

  return (
    <section className="dogfood-assistant" aria-label="AI Assist sidebar">
      <header className="dogfood-header">
        <div>
          <p className="eyebrow">AI Assist</p>
          <h1 id="app-title">Chat with this doc</h1>
        </div>
        <div className="dogfood-header-actions">
          {input.productAuth === "signed_in" ? (
            <button disabled={googleReconnecting} onClick={() => void reconnectGoogleOAuth()} type="button">
              {googleReconnecting ? "Reconnecting" : "Reconnect Google"}
            </button>
          ) : null}
          <span className={`readiness-badge ${sidebarState.canSubmitCommand ? "ready" : "blocked"}`}>
            {sidebarState.canSubmitCommand ? "Connected" : "Setup needed"}
          </span>
        </div>
      </header>

      {googleReconnectMessage ? (
        <section className="assistant-status-grid" aria-label="Google reconnect status">
          <StatusPanel label="Google" status={googleReconnecting ? "connecting" : "check authorization"} detail={googleReconnectMessage} />
        </section>
      ) : null}

      {setupBlockers.length > 0 ? (
        <section className="readiness-controls" aria-label="Sidebar setup controls">
          <ReadinessControl
            actionLabel={input.productAuth === "signed_in" ? "Signed in" : "Sign in"}
            disabled={input.productAuth === "signed_in" || input.productAuth === "signing_in"}
            label="Product login"
            status={formatProductAuth(input.productAuth)}
            tone={input.productAuth === "signed_in" ? "ready" : "blocked"}
          />
          <ReadinessControl
            actionLabel={input.googleOAuth === "reconnect_required" ? "Reconnect" : "Connect"}
            disabled={input.productAuth !== "signed_in" || input.googleOAuth === "connected" || input.googleOAuth === "connecting"}
            label="Google"
            status={formatGoogleOAuth(input.googleOAuth)}
            tone={input.googleOAuth === "connected" ? "ready" : "blocked"}
          />
          <ReadinessControl
            actionLabel="Refresh"
            disabled={input.activeDocument.status !== "missing_document_id"}
            label="Active document"
            status={sidebarState.activeDocumentId ?? formatActiveDocument(sidebarInput)}
            tone={sidebarState.activeDocumentId ? "ready" : "blocked"}
          />
        </section>
      ) : null}

      {input.context === "consent_required" && contextConsentResult?.status !== "granted" ? (
        <section className="readiness-controls" aria-label="Context consent controls">
          <ReadinessControl
            actionLabel={contextConsenting ? "Preparing" : "Allow context"}
            disabled={contextConsenting || !canEnsureContextConsent}
            label="Document context"
            onAction={ensureContextConsent}
            status={contextConsenting ? "Preparing document context" : contextConsentResult?.message ?? "Consent required"}
            tone="blocked"
          />
        </section>
      ) : null}

      {contextConsentResult ? (
        <section className="assistant-status-grid" aria-label="Context consent result">
          <StatusPanel
            label="Context consent"
            status={contextConsentResult.status === "granted" ? "ready" : "blocked"}
            detail={contextConsentResult.message}
          />
          <StatusPanel
            label="Consent log"
            status="metadata only"
            detail={safeDogfoodContextConsentLogExcludesForbiddenContent(contextConsentResult.safeLogEvent) ? "No raw document, prompt, token, provider, or action payload content." : "Blocked by unsafe metadata."}
          />
        </section>
      ) : null}

      <DogfoodSessionStatePanel
        actionResult={actionResult}
        actionSubmitting={actionSubmitting}
        actionRouteStates={actionRouteStates}
        onAction={submitActionRoute}
        proposedActions={proposedActions}
        onRefresh={refreshSessionState}
        sidebarState={sidebarState}
        streamConnecting={streamConnecting}
        streamRefreshError={streamRefreshError}
        streamRefreshing={streamRefreshing}
        streamOpen={streamOpen}
        streamState={dogfoodStreamState}
      />

      <section className="assistant-command" aria-label="Assistant command">
        <div className="quick-commands" aria-label="Common commands">
          {QUICK_COMMANDS.map((command) => (
            <button
              disabled={!canSubmit}
              key={command.kind}
              onClick={() => {
                setCommandKind(command.kind);
                setCommandPrompt(command.prompt);
              }}
              type="button"
            >
              {command.label}
            </button>
          ))}
        </div>
        <form className="assistant-command-form" onSubmit={submitCommand}>
          <label className="sr-only" htmlFor="dogfood-command-input">Assistant prompt</label>
          <textarea
            disabled={!canSubmit}
            id="dogfood-command-input"
            onChange={(event) => {
              setCommandKind("custom");
              setCommandPrompt(event.target.value);
            }}
            placeholder={commandPlaceholder}
            rows={4}
            value={commandPrompt}
          />
          <button className="primary" disabled={!canSubmit} type="submit">
            {submitting ? "Sending" : "Send"}
          </button>
        </form>
        {commandResult ? <DogfoodCommandResultPanel result={commandResult} /> : null}
      </section>

      {!sidebarState.canSubmitCommand && setupBlockers.length === 0 ? (
        <section className="assistant-status-grid" aria-label="Assistant status">
          <StatusPanel label="Context" status={formatContext(sidebarInput.context)} detail={formatCommandReadiness(sidebarState)} />
          <StatusPanel label="Provider" status={formatProvider(sidebarInput.provider)} detail={formatReviewReadiness(sidebarState)} />
          <StatusPanel
            label="Safe log"
            status="metadata only"
            detail={safeDogfoodSidebarLogExcludesForbiddenContent(sidebarState.safeLogEvent) ? "No raw document, prompt, token, provider, or action payload content." : "Blocked by unsafe metadata."}
          />
        </section>
      ) : null}

      {!sidebarState.canSubmitCommand && commandBlockers.length > 0 ? (
        <section className="blocker-list" aria-label="Current blockers">
          <h2>What is blocking the assistant</h2>
          {commandBlockers.slice(0, 5).map((blocker) => (
            <BlockerRow blocker={blocker} key={`${blocker.area}-${blocker.code}`} />
          ))}
        </section>
      ) : null}
    </section>
  );
}

export function DogfoodSessionStatePanel({
  actionResult,
  actionRouteStates,
  actionSubmitting,
  onRefresh,
  onAction,
  proposedActions,
  sidebarState,
  streamConnecting,
  streamRefreshError,
  streamRefreshing,
  streamOpen,
  streamState
}: {
  actionResult: DogfoodActionRouteResult | null;
  actionRouteStates: Record<string, DogfoodLocalActionRouteState>;
  actionSubmitting: string | null;
  onRefresh: () => Promise<void>;
  onAction: (kind: DogfoodActionRouteKind, action: ProposedActionView) => Promise<void>;
  proposedActions: ProposedActionView[];
  sidebarState: DogfoodSidebarState;
  streamConnecting: boolean;
  streamRefreshError: string | null;
  streamRefreshing: boolean;
  streamOpen: boolean;
  streamState: SessionStreamClientState;
}): ReactElement {
  return (
    <section className="dogfood-session-state" aria-label="Assistant stream and proposed actions">
      <article className="assistant-stream-panel">
        <header>
          <h2>Chat</h2>
          <span>{streamRefreshing ? "Reconnecting" : streamConnecting || streamOpen ? "Listening" : streamState.reconnectRequired ? "Reconnect required" : streamState.session.connection}</span>
        </header>
        <button disabled={!sidebarState.canOpenStream || streamRefreshing} onClick={() => void onRefresh()} type="button">
          {streamRefreshing ? "Reconnecting" : "Reconnect stream"}
        </button>
        {streamState.session.progress.length > 0 ? (
          <ul className="stream-list" aria-label="Assistant progress">
            {streamState.session.progress.map((progress) => (
              <li key={progress.eventId ?? progress.message}>{progress.message}</li>
            ))}
          </ul>
        ) : null}
        <div className="message-list">
          {streamState.session.messages.length === 0 ? (
            <p className="empty-state">Ask a question about this Google Doc.</p>
          ) : (
            streamState.session.messages.map((message) => (
              <p className={`message ${message.role}`} key={message.messageId}>
                <span>{message.status === "FINAL" ? "Final" : "Streaming"}</span>
                {message.content}
              </p>
            ))
          )}
        </div>
        {streamState.reconnectRequired ? (
          <p className="stream-warning" role="status">
            Refresh durable session state before applying changes.
          </p>
        ) : null}
        {streamRefreshError ? (
          <p className="stream-error" role="status">
            {streamRefreshError}
          </p>
        ) : null}
      </article>

      <article className="assistant-action-panel">
        <header>
          <h2>Suggested edits</h2>
          <span>{proposedActions.length === 0 ? "No backend actions" : `${proposedActions.length} backend action${proposedActions.length === 1 ? "" : "s"}`}</span>
        </header>
        {proposedActions.length === 0 ? (
          <p className="empty-state">Edit suggestions will appear here after the assistant proposes them.</p>
        ) : (
          <div className="dogfood-review-list">
            {proposedActions.map((action) => (
              <DogfoodActionReviewCard
                action={action}
                actionRouteState={actionRouteStates[action.actionId] ?? { pendingKind: null, acceptedKind: null }}
                actionSubmitting={actionSubmitting}
                key={action.actionId}
                onAction={onAction}
                sidebarState={sidebarState}
              />
            ))}
          </div>
        )}
        {actionResult ? <DogfoodActionResultPanel result={actionResult} /> : null}
      </article>

      <article className="assistant-status-panel">
        <span>Stream log</span>
        <strong>{safeSessionStreamLogExcludesForbiddenContent(streamState.safeLogEvent) ? "metadata only" : "blocked"}</strong>
        <p>No prompt, document, model-output body, token, provider key, or action payload is recorded in the stream log event.</p>
      </article>
    </section>
  );
}

export function DogfoodActionReviewCard({
  action,
  actionRouteState,
  actionSubmitting,
  onAction,
  sidebarState
}: {
  action: ProposedActionView;
  actionRouteState: DogfoodLocalActionRouteState;
  actionSubmitting: string | null;
  onAction: (kind: DogfoodActionRouteKind, action: ProposedActionView) => Promise<void>;
  sidebarState: DogfoodSidebarState;
}): ReactElement {
  const actionState = getProposedActionState(action);
  const approveSubmitting = actionSubmitting === `approve:${action.actionId}`;
  const rejectSubmitting = actionSubmitting === `reject:${action.actionId}`;
  const applySubmitting = actionSubmitting === `apply:${action.actionId}`;
  const awaitingBackendStatus = isAcceptedActionRouteAwaitingStatus(actionRouteState, action);
  const hasBackendSession = Boolean(action.sessionId?.trim());
  const actionBusy = Boolean(actionSubmitting) || actionRouteState.pendingKind !== null || awaitingBackendStatus;
  const canApprove = hasBackendSession && sidebarState.canReviewProposedActions && actionState.canApprove && !actionBusy;
  const canReject = hasBackendSession && sidebarState.canReviewProposedActions && actionState.canReject && !actionBusy;
  const canApply = hasBackendSession && sidebarState.canApplyApprovedAction && actionState.canApply && !actionBusy;

  return (
    <article className={`dogfood-review-card ${action.status.toLowerCase()}`}>
      <header>
        <div>
          <p className="action-id">{action.actionId}</p>
          <h3>{formatActionType(action.actionType)}</h3>
        </div>
        <span className="status-badge">{actionState.label}</span>
      </header>
      <p>{action.preview ?? "Backend proposed an edit without exposing a decrypted payload preview."}</p>
      <dl className="review-details">
        <div>
          <dt>Resource</dt>
          <dd>{action.resourceTitle ?? action.resourceId ?? "Backend-owned resource"}</dd>
        </div>
        <div>
          <dt>Apply gate</dt>
          <dd>{formatActionGate(sidebarState, action, canApply, awaitingBackendStatus)}</dd>
        </div>
      </dl>
      <div className="card-actions">
        <button disabled={!canReject} onClick={() => void onAction("reject", action)} type="button">
          {rejectSubmitting ? "Rejecting" : "Reject"}
        </button>
        <button disabled={!canApprove} onClick={() => void onAction("approve", action)} type="button">
          {approveSubmitting ? "Approving" : "Approve"}
        </button>
        <button className="primary" disabled={!canApply} onClick={() => void onAction("apply", action)} type="button">
          {applySubmitting ? "Applying" : "Apply"}
        </button>
      </div>
    </article>
  );
}

export function DogfoodActionResultPanel({ result }: { result: DogfoodActionRouteResult }): ReactElement {
  return (
    <article className={`command-result ${result.status}`} aria-live="polite">
      <header>
        <div>
          <span>{result.status.replace(/_/g, " ")}</span>
          <strong>{result.title}</strong>
        </div>
        <span>{result.retryable ? "Retryable" : "No retry"}</span>
      </header>
      <p>{result.message}</p>
      <dl className="command-result-metadata">
        <div>
          <dt>Route</dt>
          <dd>{result.route}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{result.actionId}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{result.errorCode ?? "None"}</dd>
        </div>
        <div>
          <dt>Safe log</dt>
          <dd>{safeDogfoodActionLogExcludesForbiddenContent(result.safeLogEvent) ? "metadata only" : "blocked"}</dd>
        </div>
      </dl>
    </article>
  );
}

export function DogfoodCommandResultPanel({ result }: { result: DogfoodCommandResult }): ReactElement {
  return (
    <article className={`command-result ${result.status}`} aria-live="polite">
      <header>
        <div>
          <span>{result.status.replace(/_/g, " ")}</span>
          <strong>{result.title}</strong>
        </div>
        <span>{result.retryable ? "Retryable" : "No retry"}</span>
      </header>
      <p>{result.message}</p>
      <dl className="command-result-metadata">
        <div>
          <dt>Route</dt>
          <dd>{result.route}</dd>
        </div>
        <div>
          <dt>Command</dt>
          <dd>{result.commandId ?? "Pending"}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{result.errorCode ?? "None"}</dd>
        </div>
        <div>
          <dt>Safe log</dt>
          <dd>{safeDogfoodCommandLogExcludesForbiddenContent(result.safeLogEvent) ? "metadata only" : "blocked"}</dd>
        </div>
      </dl>
    </article>
  );
}

export function createDogfoodSidebarInputFromSearch(
  search: string,
  fallbackDocumentId: string | null
): DogfoodSidebarContractInput {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const documentId = params.get("documentId")?.trim() || fallbackDocumentId;
  return {
    productAuth: normalizeProductAuthStatus(params.get("productAuthStatus")),
    googleOAuth: normalizeGoogleOAuthStatus(params.get("googleOAuthStatus")),
    activeDocument: documentId
      ? {
          status: "detected",
          documentId
        }
      : {
          status: params.get("activeTabUrl") ? "missing_document_id" : "unsupported_page"
        },
    context: normalizeContractStatus(params.get("contextStatus"), DEFAULT_CONTEXT_STATUS, [
      "idle",
      "loading",
      "ready",
      "consent_required",
      "permission_denied",
      "unavailable",
      "error"
    ]),
    provider: normalizeContractStatus(params.get("providerStatus"), DEFAULT_PROVIDER_STATUS, [
      "unknown",
      "ready",
      "missing",
      "unavailable",
      "rate_limited",
      "error"
    ]),
    command: normalizeContractStatus(params.get("commandStatus"), DEFAULT_COMMAND_STATUS, [
      "idle",
      "ready",
      "submitting",
      "accepted",
      "blocked",
      "failed"
    ]),
    stream: normalizeContractStatus(params.get("streamStatus"), DEFAULT_STREAM_STATUS, [
      "disconnected",
      "connecting",
      "open",
      "reconnect_required",
      "closed",
      "error",
      "unavailable"
    ]),
    proposedActions: normalizeContractStatus(params.get("proposedActionsStatus"), DEFAULT_PROPOSED_ACTIONS_STATUS, [
      "none",
      "loading",
      "ready",
      "blocked",
      "error"
    ]),
    apply: normalizeContractStatus(params.get("applyStatus"), DEFAULT_APPLY_STATUS, [
      "blocked",
      "ready",
      "applying",
      "applied",
      "conflicted",
      "failed",
      "uncertain"
    ]),
    controlledDocumentWriteApproved: params.get("controlledDocumentWriteApproved") === "true"
  };
}

export function preventDogfoodCommandSubmit(event: Pick<FormEvent<HTMLFormElement>, "preventDefault">): void {
  event.preventDefault();
}

function ReadinessControl({
  actionLabel,
  disabled,
  label,
  onAction,
  status,
  tone
}: {
  actionLabel: string;
  disabled: boolean;
  label: string;
  onAction?: () => void;
  status: string;
  tone: "ready" | "blocked";
}): ReactElement {
  return (
    <article className={`readiness-control ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{status}</strong>
      </div>
      <button disabled={disabled} onClick={onAction} type="button">
        {actionLabel}
      </button>
    </article>
  );
}

function StatusPanel({ detail, label, status }: { detail: string; label: string; status: string }): ReactElement {
  return (
    <article className="assistant-status-panel">
      <span>{label}</span>
      <strong>{status}</strong>
      <p>{detail}</p>
    </article>
  );
}

function BlockerRow({ blocker }: { blocker: DogfoodSidebarBlocker }): ReactElement {
  return (
    <article className="blocker-row">
      <div>
        <strong>{blocker.code}</strong>
        <p>{blocker.message}</p>
      </div>
      <span>{blocker.retryable ? "Retryable" : "User action"}</span>
    </article>
  );
}

function getRuntimeSearch(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.search;
}

function getRuntimeEnvValue(key: string, fallback: string): string {
  const queryValue = getRuntimeSearchValue(key);
  if (queryValue) {
    return queryValue;
  }

  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function getRuntimeSearchValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const queryParamByEnvKey: Record<string, string> = {
    VITE_API_BASE_URL: "apiBaseUrl",
    VITE_SSE_BASE_URL: "sseBaseUrl",
    VITE_DEMO_SESSION_ID: "sessionId",
    VITE_CONTEXT_CONSENT_PATH: "contextConsentPath",
    VITE_COMMAND_CREATE_PATH: "commandCreatePath",
    VITE_ACTION_DECISION_PATH: "actionDecisionPath",
    VITE_ACTION_APPLY_PATH: "actionApplyPath",
    VITE_SESSION_STREAM_PATH: "sessionStreamPath"
  };
  const rawValue = new URLSearchParams(window.location.search).get(queryParamByEnvKey[key] ?? key);
  const value = rawValue?.trim();

  return value ? value : null;
}

function getExtensionRuntimeAuthBridge(): ExtensionRuntimeAuthBridge | null {
  const runtime = getBrowserExtensionRuntime();
  if (!runtime?.sendMessage) {
    return null;
  }
  const sendMessage = runtime.sendMessage;
  return {
    async sendMessage(message) {
      const response = await sendMessage(message);
      return isExtensionAuthorizationResponse(response) ? response : { ok: false, error: "Extension auth response was not usable." };
    }
  };
}

function getBrowserExtensionRuntime(): { sendMessage?: (message: unknown) => Promise<unknown> | unknown } | null {
  const globalRuntime = globalThis as {
    chrome?: { runtime?: { sendMessage?: (message: unknown) => Promise<unknown> | unknown } };
    browser?: { runtime?: { sendMessage?: (message: unknown) => Promise<unknown> | unknown } };
  };
  return globalRuntime.browser?.runtime ?? globalRuntime.chrome?.runtime ?? null;
}

function isExtensionAuthorizationResponse(
  value: unknown
): value is { readonly ok?: boolean; readonly authorization?: string | null; readonly error?: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const response = value as Record<string, unknown>;
  return (
    (response.ok === undefined || typeof response.ok === "boolean") &&
    (response.authorization === undefined || response.authorization === null || typeof response.authorization === "string") &&
    (response.error === undefined || typeof response.error === "string")
  );
}

function normalizeProductAuthStatus(rawStatus: string | null): ProductAuthStatus {
  if (rawStatus === "signed_in" || rawStatus === "signed_out" || rawStatus === "signing_in" || rawStatus === "unknown" || rawStatus === "error") {
    return rawStatus;
  }
  if (rawStatus === "auth_expired" || rawStatus === "expired") {
    return "expired";
  }
  return "signed_out";
}

function normalizeGoogleOAuthStatus(rawStatus: string | null): GoogleOAuthStatus {
  if (
    rawStatus === "unknown" ||
    rawStatus === "not_connected" ||
    rawStatus === "connecting" ||
    rawStatus === "connected" ||
    rawStatus === "reconnect_required" ||
    rawStatus === "access_denied" ||
    rawStatus === "dependency_error"
  ) {
    return rawStatus;
  }
  if (rawStatus === "auth_expired") {
    return "reconnect_required";
  }
  return "not_connected";
}

function normalizeContractStatus<T extends string>(rawStatus: string | null, fallback: T, allowed: readonly T[]): T {
  return allowed.includes(rawStatus as T) ? (rawStatus as T) : fallback;
}

function formatProductAuth(status: DogfoodSidebarContractInput["productAuth"]): string {
  const labels: Record<DogfoodSidebarContractInput["productAuth"], string> = {
    unknown: "Unknown",
    signed_out: "Signed out",
    signing_in: "Signing in",
    signed_in: "Signed in",
    expired: "Expired",
    error: "Error"
  };
  return labels[status];
}

function formatGoogleOAuth(status: DogfoodSidebarContractInput["googleOAuth"]): string {
  const labels: Record<DogfoodSidebarContractInput["googleOAuth"], string> = {
    unknown: "Unknown",
    not_connected: "Not connected",
    connecting: "Connecting",
    connected: "Connected",
    reconnect_required: "Reconnect required",
    access_denied: "Access denied",
    dependency_error: "Service unavailable"
  };
  return labels[status];
}

function formatActiveDocument(input: DogfoodSidebarContractInput): string {
  if (input.activeDocument.status === "unsupported_page") {
    return "Unsupported page";
  }
  if (input.activeDocument.status === "missing_document_id") {
    return "Missing document ID";
  }
  return "Detected";
}

function formatContext(status: DogfoodSidebarContractInput["context"]): string {
  const labels: Record<DogfoodSidebarContractInput["context"], string> = {
    idle: "Not loaded",
    loading: "Loading",
    ready: "Ready",
    consent_required: "Consent required",
    permission_denied: "Permission denied",
    unavailable: "Unavailable",
    error: "Error"
  };
  return labels[status];
}

function formatProvider(status: DogfoodSidebarContractInput["provider"]): string {
  const labels: Record<DogfoodSidebarContractInput["provider"], string> = {
    unknown: "Unknown",
    ready: "Ready",
    missing: "Required",
    unavailable: "Unavailable",
    rate_limited: "Rate limited",
    error: "Error"
  };
  return labels[status];
}

function formatCommandReadiness(state: DogfoodSidebarState): string {
  if (state.commandReadiness === "in_progress") {
    return "In progress";
  }
  if (state.commandReadiness === "accepted") {
    return "Accepted";
  }
  if (state.commandReadiness === "failed") {
    return "Failed";
  }
  return state.commandReadiness === "ready" ? "Ready" : "Blocked";
}

function formatStream(input: DogfoodSidebarContractInput, state: DogfoodSidebarState): string {
  if (state.streamReadiness === "available") {
    return "Live assistant progress can render when backend events arrive.";
  }
  if (state.streamReadiness === "refresh_required") {
    return "Durable session refresh is required before apply controls can proceed.";
  }
  if (input.stream === "unavailable" || input.stream === "error") {
    return "Streaming is not available from the backend.";
  }
  return "Stream opens after command readiness and accepted command state.";
}

function formatProposedActions(input: DogfoodSidebarContractInput): string {
  const labels: Record<DogfoodSidebarContractInput["proposedActions"], string> = {
    none: "None",
    loading: "Loading",
    ready: "Ready",
    blocked: "Blocked",
    error: "Error"
  };
  return labels[input.proposedActions];
}

function formatReviewReadiness(state: DogfoodSidebarState): string {
  return state.canReviewProposedActions
    ? "Backend proposed actions can render as review cards."
    : "Review cards stay hidden until backend action state is ready.";
}

function formatApplyReadiness(input: DogfoodSidebarContractInput, state: DogfoodSidebarState): string {
  if (state.canApplyApprovedAction) {
    return "Approved actions can be applied with controlled-document approval.";
  }
  if (!input.controlledDocumentWriteApproved) {
    return "Write approval is required before any mutation control is enabled.";
  }
  if (state.applyReadiness === "uncertain") {
    return "Refresh before retrying because mutation state is uncertain.";
  }
  return "Apply stays blocked until backend action and stream state are ready.";
}

function formatActionType(actionType: string | null | undefined): string {
  if (actionType === "INSERT_TEXT") {
    return "Insert text";
  }
  if (actionType === "REPLACE_TEXT") {
    return "Replace text";
  }
  return "Backend proposed edit";
}

function formatActionGate(
  state: DogfoodSidebarState,
  action: ProposedActionView,
  canApply: boolean,
  awaitingBackendStatus: boolean
): string {
  if (!action.sessionId?.trim()) {
    return "Refresh backend action state before reviewing or applying this action.";
  }
  if (awaitingBackendStatus) {
    return "Waiting for backend status refresh before another action.";
  }
  return formatApplyGate(state, action.status, canApply);
}

function formatApplyGate(state: DogfoodSidebarState, actionStatus: string, canApply = false): string {
  if (canApply) {
    return "Ready";
  }
  if (actionStatus !== "APPROVED") {
    return "Approve the action before apply.";
  }
  if (!state.canApplyApprovedAction) {
    return "Apply stays disabled until backend readiness and controlled-document approval are present.";
  }
  return "Ready";
}

function isAcceptedActionRouteAwaitingStatus(
  routeState: DogfoodLocalActionRouteState,
  action: ProposedActionView
): boolean {
  if (routeState.acceptedKind === "approve") {
    return action.status === "PROPOSED";
  }
  if (routeState.acceptedKind === "reject") {
    return action.status !== "REJECTED";
  }
  if (routeState.acceptedKind === "apply") {
    return action.status === "APPROVED";
  }
  return false;
}

function createRuntimeDogfoodAuthProvider(): DogfoodCommandAuthProvider {
  const authRuntime = getExtensionRuntimeAuthBridge();
  return authRuntime
    ? createExtensionDogfoodCommandAuthProvider(authRuntime)
    : async () => {
        throw new Error("Extension product auth runtime is required.");
      };
}

function createAuthorizedStreamFetcher(
  authorization: string,
  fetcher: SessionStreamRouteFetch | undefined
): SessionStreamRouteFetch {
  const routeFetch = fetcher ?? ((streamUrl, init) => fetch(streamUrl, init));

  return (streamUrl, init) =>
    routeFetch(streamUrl, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: authorization
      }
    });
}

async function resolveStreamAuthorization(authProvider: DogfoodCommandAuthProvider): Promise<string> {
  const authorization = await authProvider();
  if (!authorization.startsWith("Bearer ")) {
    throw new Error(SESSION_STREAM_AUTH_UNAVAILABLE_MESSAGE);
  }
  return authorization;
}

function formatSessionStreamHttpError(status: number, contentType: string | null): string {
  return `${SESSION_STREAM_UNAVAILABLE_MESSAGE} HTTP ${status}${contentType ? `; ${contentType}` : ""}.`;
}

function formatSessionStreamTransportError(error: unknown): string {
  if (error instanceof Error && error.message === SESSION_STREAM_AUTH_UNAVAILABLE_MESSAGE) {
    return SESSION_STREAM_AUTH_UNAVAILABLE_MESSAGE;
  }
  const errorType = error instanceof Error ? error.name : typeof error;
  return `${SESSION_STREAM_UNAVAILABLE_MESSAGE} ${errorType}.`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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

function RealFlowClientPanel({ flow }: { flow: RealFlowClientViewModel }): ReactElement {
  return (
    <section className="real-flow-harness" aria-label="Real backend flow client states">
      <header className="setup-header">
        <div>
          <p className="eyebrow">Real-flow clients</p>
          <h2>HTTP and SSE state hardening</h2>
        </div>
        <span className="context-pill">Configurable endpoints</span>
      </header>

      <div className="real-flow-grid">
        <article className="real-flow-summary">
          <h3>Client wiring</h3>
          <dl className="stream-metadata">
            <div>
              <dt>HTTP base</dt>
              <dd>{flow.httpBaseUrl}</dd>
            </div>
            <div>
              <dt>SSE stream</dt>
              <dd>{flow.streamUrl}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{flow.sessionId}</dd>
            </div>
            <div>
              <dt>Refresh</dt>
              <dd>{flow.durableRefreshRoute}</dd>
            </div>
            <div>
              <dt>Safe log</dt>
              <dd>{safeRealFlowLogExcludesForbiddenContent(flow.safeLogEvent) ? "metadata only" : "blocked"}</dd>
            </div>
          </dl>
          <p className="refresh-guidance">
            After reconnect, duplicate event, malformed event, or sequence gap, refresh durable session state over HTTP
            before applying changes.
          </p>
        </article>

        <div className="real-flow-steps" aria-label="Real backend flow status coverage">
          {flow.steps.map((step) => (
            <article className={`real-flow-step ${step.tone}`} key={step.id}>
              <header>
                <span>{step.label}</span>
                <strong>{step.status}</strong>
              </header>
              <p>{step.message}</p>
              <dl>
                <div>
                  <dt>Route</dt>
                  <dd>{step.route}</dd>
                </div>
                <div>
                  <dt>Retry</dt>
                  <dd>{step.retryable ? "Available" : "Not available"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
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
        {scenario.platformProviders.map((provider) => (
          <SetupCard card={provider} key={provider.id} />
        ))}
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
