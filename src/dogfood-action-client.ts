import { type DogfoodCommandAuthProvider, type DogfoodCommandFetcher, type DogfoodCommandIdProvider } from "./dogfood-command-client";
import { type DogfoodSidebarState } from "./dogfood-sidebar-state";
import { DEFAULT_REAL_FLOW_ENDPOINTS } from "./real-flow-client";

export const DOGFOOD_ACTION_LOG_EVENT = "dogfood-action-route";

export type DogfoodActionDecision = "approve" | "reject";
export type DogfoodActionRouteKind = DogfoodActionDecision | "apply";
export type DogfoodActionRouteResultStatus = "accepted" | "blocked" | "retryable_error" | "dependency_error" | "failed";

export interface DogfoodActionRouteRequest {
  readonly kind: DogfoodActionRouteKind;
  readonly httpBaseUrl: string;
  readonly sessionId: string;
  readonly actionId: string;
  readonly sidebarState: DogfoodSidebarState;
  readonly actionStatus: string;
  readonly decisionPathTemplate?: string;
  readonly applyPathTemplate?: string;
}

export interface DogfoodActionRouteOptions {
  readonly authProvider: DogfoodCommandAuthProvider;
  readonly fetcher?: DogfoodCommandFetcher;
  readonly idProvider?: DogfoodCommandIdProvider;
  readonly randomIdProvider?: DogfoodCommandIdProvider;
}

export interface DogfoodActionRouteResult {
  readonly status: DogfoodActionRouteResultStatus;
  readonly title: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly route: string;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly actionId: string;
  readonly errorCode: string | null;
  readonly safeLogEvent: DogfoodActionSafeLogEvent;
}

export interface DogfoodActionSafeLogEvent {
  readonly event: typeof DOGFOOD_ACTION_LOG_EVENT;
  readonly routeKind: DogfoodActionRouteKind;
  readonly routeTemplate: string;
  readonly route: string;
  readonly actionIdPresent: boolean;
  readonly idempotencyKeyPresent: boolean;
  readonly resultStatus: DogfoodActionRouteResultStatus;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly errorCode: string | null;
  readonly blockerCodes: readonly string[];
}

const AUTHORIZATION_HEADER = "Authorization";
const JSON_CONTENT_TYPE = "application/json";
const FORBIDDEN_ACTION_LOG_PATTERNS = [
  /authorization/i,
  /bearer/i,
  /oauth/i,
  /provider[_ -]?key/i,
  /api[_ -]?key/i,
  /prompt/i,
  /selected[_ -]?text/i,
  /document[_ -]?text/i,
  /model[_ -]?output/i,
  /model response/i,
  /action[_ -]?payload/i,
  /replacement/i,
  /current[_ -]?text/i,
  /original[_ -]?text/i,
  /decrypted/i,
  /ciphertext/i,
  /screenshot/i,
  /ocr/i,
  /accessibility/i,
  /(^|[^a-z0-9])sk-[a-z0-9]/i
] as const;

export async function submitDogfoodActionRoute(
  request: DogfoodActionRouteRequest,
  options: DogfoodActionRouteOptions
): Promise<DogfoodActionRouteResult> {
  const routeTemplate =
    request.kind === "apply"
      ? request.applyPathTemplate ?? DEFAULT_REAL_FLOW_ENDPOINTS.actionApply
      : request.decisionPathTemplate ?? DEFAULT_REAL_FLOW_ENDPOINTS.actionDecision;
  const route = materializeDogfoodActionPath(routeTemplate, request);
  const blocker = getActionRouteBlocker(request);
  if (blocker) {
    return actionBlockedResult(request, routeTemplate, route, blocker);
  }

  let authorization: string;
  try {
    authorization = await options.authProvider();
  } catch {
    return actionBlockedResult(request, routeTemplate, route, "PRODUCT_AUTH_REQUIRED");
  }

  if (!authorization.startsWith("Bearer ")) {
    return actionBlockedResult(request, routeTemplate, route, "PRODUCT_AUTH_REQUIRED");
  }

  const fetcher = options.fetcher ?? defaultDogfoodActionFetcher;
  const idempotencyKey = request.kind === "apply" ? options.idProvider?.() ?? createDogfoodActionId(options.randomIdProvider) : null;

  let response: Response;
  try {
    response = await fetcher(joinUrl(request.httpBaseUrl, route), {
      method: "POST",
      headers: {
        [AUTHORIZATION_HEADER]: authorization,
        "Content-Type": JSON_CONTENT_TYPE,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(createDogfoodActionBody(request))
    });
  } catch {
    return actionTransportFailureResult(request, routeTemplate, route, idempotencyKey);
  }

  const body = await parseJsonBody(response);
  return mapDogfoodActionResponse(request, routeTemplate, route, idempotencyKey, response.status, body);
}

export function materializeDogfoodActionPath(pathTemplate: string, request: DogfoodActionRouteRequest): string {
  return pathTemplate
    .replace("{sessionId}", encodeURIComponent(request.sessionId))
    .replace("{actionId}", encodeURIComponent(request.actionId))
    .replace("{decision}", encodeURIComponent(request.kind === "reject" ? "reject" : "approve"));
}

export function createDogfoodActionBody(request: DogfoodActionRouteRequest): Record<string, unknown> {
  if (request.kind === "apply") {
    return {
      actionId: request.actionId
    };
  }
  return {
    actionId: request.actionId,
    decision: request.kind,
    reasonCode: request.kind === "approve" ? "USER_APPROVED" : "USER_REJECTED"
  };
}

export function createDogfoodActionSafeLogEvent(input: {
  readonly request: DogfoodActionRouteRequest;
  readonly routeTemplate: string;
  readonly route: string;
  readonly idempotencyKey: string | null;
  readonly resultStatus: DogfoodActionRouteResultStatus;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly errorCode: string | null;
}): DogfoodActionSafeLogEvent {
  return {
    event: DOGFOOD_ACTION_LOG_EVENT,
    routeKind: input.request.kind,
    routeTemplate: input.routeTemplate,
    route: input.route,
    actionIdPresent: Boolean(input.request.actionId),
    idempotencyKeyPresent: Boolean(input.idempotencyKey),
    resultStatus: input.resultStatus,
    httpStatus: input.httpStatus,
    requestId: input.requestId,
    correlationId: input.correlationId,
    errorCode: input.errorCode,
    blockerCodes: input.request.sidebarState.blockers.map((blocker) => blocker.code)
  };
}

export function safeDogfoodActionLogExcludesForbiddenContent(event: DogfoodActionSafeLogEvent): boolean {
  const serialized = JSON.stringify(event);
  return FORBIDDEN_ACTION_LOG_PATTERNS.every((pattern) => !pattern.test(serialized));
}

function getActionRouteBlocker(request: DogfoodActionRouteRequest): string | null {
  if (!request.actionId.trim()) {
    return "PROPOSED_ACTIONS_UNAVAILABLE";
  }
  if (!request.sessionId.trim()) {
    return "ACTION_SESSION_REQUIRED";
  }
  if (request.kind === "apply") {
    if (!request.sidebarState.canApplyApprovedAction) {
      return firstApplyBlockerCode(request.sidebarState);
    }
    return request.actionStatus === "APPROVED" ? null : "APPLY_BACKEND_NOT_READY";
  }
  if (!request.sidebarState.canReviewProposedActions) {
    return "PROPOSED_ACTIONS_UNAVAILABLE";
  }
  if (request.kind === "approve") {
    return request.actionStatus === "PROPOSED" ? null : "PROPOSED_ACTIONS_UNAVAILABLE";
  }
  return request.actionStatus === "PROPOSED" || request.actionStatus === "APPROVED" ? null : "PROPOSED_ACTIONS_UNAVAILABLE";
}

function firstApplyBlockerCode(state: DogfoodSidebarState): string {
  return state.blockers.find((blocker) => blocker.area === "apply" || blocker.area === "stream" || blocker.area === "actions")?.code ?? "APPLY_BACKEND_NOT_READY";
}

function actionBlockedResult(
  request: DogfoodActionRouteRequest,
  routeTemplate: string,
  route: string,
  errorCode: string
): DogfoodActionRouteResult {
  return {
    status: "blocked",
    title: request.kind === "apply" ? "Apply blocked" : "Review action blocked",
    message: safeBlockedMessage(errorCode),
    retryable: errorCode !== "APPLY_WRITE_APPROVAL_REQUIRED",
    route,
    requestId: null,
    correlationId: null,
    actionId: request.actionId,
    errorCode,
    safeLogEvent: createDogfoodActionSafeLogEvent({
      request,
      routeTemplate,
      route,
      idempotencyKey: null,
      resultStatus: "blocked",
      httpStatus: null,
      requestId: null,
      correlationId: null,
      errorCode
    })
  };
}

function actionTransportFailureResult(
  request: DogfoodActionRouteRequest,
  routeTemplate: string,
  route: string,
  idempotencyKey: string | null
): DogfoodActionRouteResult {
  return {
    status: "retryable_error",
    title: "Action route can be retried",
    message: "The backend action route is unavailable from this browser session. Retry after readiness is refreshed.",
    retryable: true,
    route,
    requestId: null,
    correlationId: null,
    actionId: request.actionId,
    errorCode: "BACKEND_UNAVAILABLE",
    safeLogEvent: createDogfoodActionSafeLogEvent({
      request,
      routeTemplate,
      route,
      idempotencyKey,
      resultStatus: "retryable_error",
      httpStatus: null,
      requestId: null,
      correlationId: null,
      errorCode: "BACKEND_UNAVAILABLE"
    })
  };
}

function mapDogfoodActionResponse(
  request: DogfoodActionRouteRequest,
  routeTemplate: string,
  route: string,
  idempotencyKey: string | null,
  httpStatus: number,
  body: unknown
): DogfoodActionRouteResult {
  const envelope = asRecord(body) ?? {};
  const data = asRecord(envelope.data) ?? envelope;
  const error = asRecord(envelope.error) ?? asRecord(data.error);
  const requestId = stringValue(envelope.requestId) ?? stringValue(data.requestId);
  const correlationId = stringValue(envelope.correlationId) ?? stringValue(data.correlationId);
  const errorCode = stringValue(error?.code) ?? safeHttpErrorCode(httpStatus);
  const resultStatus = classifyResultStatus(httpStatus, error);
  const retryable = booleanValue(error?.retryable) ?? (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500);

  return {
    status: resultStatus,
    title: titleForStatus(request.kind, resultStatus),
    message: messageForStatus(request.kind, resultStatus, errorCode),
    retryable,
    route,
    requestId,
    correlationId,
    actionId: request.actionId,
    errorCode,
    safeLogEvent: createDogfoodActionSafeLogEvent({
      request,
      routeTemplate,
      route,
      idempotencyKey,
      resultStatus,
      httpStatus,
      requestId,
      correlationId,
      errorCode
    })
  };
}

function classifyResultStatus(httpStatus: number, error: Record<string, unknown> | null): DogfoodActionRouteResultStatus {
  if (httpStatus >= 200 && httpStatus < 300) {
    return "accepted";
  }
  const code = stringValue(error?.code);
  const category = stringValue(error?.category);
  const retryable = booleanValue(error?.retryable) ?? (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500);
  if (category === "DEPENDENCY" || code?.includes("DEPENDENCY") || code?.includes("UNAVAILABLE") || httpStatus === 501 || httpStatus === 503) {
    return "dependency_error";
  }
  if (retryable) {
    return "retryable_error";
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return "blocked";
  }
  return "failed";
}

function titleForStatus(kind: DogfoodActionRouteKind, status: DogfoodActionRouteResultStatus): string {
  if (status === "accepted") {
    return kind === "apply" ? "Apply request accepted" : "Review decision accepted";
  }
  if (status === "dependency_error") {
    return "Backend dependency is not ready";
  }
  if (status === "retryable_error") {
    return "Action route can be retried";
  }
  if (status === "blocked") {
    return kind === "apply" ? "Apply blocked" : "Review action blocked";
  }
  return kind === "apply" ? "Apply failed" : "Review action failed";
}

function messageForStatus(kind: DogfoodActionRouteKind, status: DogfoodActionRouteResultStatus, errorCode: string | null): string {
  if (status === "accepted") {
    return kind === "apply"
      ? "The backend accepted the idempotent apply request. Final mutation state must come from backend status."
      : "The backend accepted the review decision. Action status will refresh from backend state.";
  }
  if (status === "dependency_error") {
    return "A backend dependency is not configured or available yet. No mutation was performed by the client.";
  }
  if (status === "retryable_error") {
    return "The backend returned a retryable action-route error. Refresh readiness before retrying.";
  }
  if (status === "blocked") {
    return safeBlockedMessage(errorCode);
  }
  return "The backend could not process the action route. Refresh state before trying again.";
}

function safeBlockedMessage(errorCode: string | null): string {
  if (errorCode === "PRODUCT_AUTH_REQUIRED") {
    return "Sign in to AI Assist before reviewing or applying actions.";
  }
  if (errorCode === "APPLY_WRITE_APPROVAL_REQUIRED") {
    return "Controlled-document write approval is required before apply.";
  }
  if (errorCode === "STREAM_REFRESH_REQUIRED" || errorCode === "APPLY_UNCERTAIN") {
    return "Refresh durable session state before applying changes.";
  }
  if (errorCode === "PROPOSED_ACTIONS_UNAVAILABLE") {
    return "Backend proposed-action state is not ready for review.";
  }
  if (errorCode === "ACTION_SESSION_REQUIRED") {
    return "Refresh backend action state before reviewing or applying this action.";
  }
  return "Backend action state is not ready for this control.";
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function safeHttpErrorCode(status: number): string | null {
  if (status === 401) {
    return "AUTHENTICATION_REQUIRED";
  }
  if (status === 403) {
    return "AUTHORIZATION_DENIED";
  }
  if (status === 408) {
    return "REQUEST_TIMEOUT";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status === 501 || status === 503) {
    return "DEPENDENCY_UNAVAILABLE";
  }
  return status >= 400 ? "ACTION_ROUTE_FAILED" : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function createDogfoodActionId(randomIdProvider: DogfoodCommandIdProvider | undefined): string {
  const uuid = randomIdProvider?.() ?? globalThis.crypto?.randomUUID?.();
  if (uuid?.trim()) {
    return `apply_${sanitizeActionIdPart(uuid)}`;
  }
  return `apply_${Date.now().toString(36)}_${sanitizeActionIdPart(Math.random().toString(36).slice(2))}`;
}

function sanitizeActionIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_");
}

async function defaultDogfoodActionFetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
