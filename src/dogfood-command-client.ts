import { requestExtensionAuthorizationHeader, type ExtensionRuntimeAuthBridge } from "./product-auth";
import { type DogfoodSidebarBlocker, type DogfoodSidebarState } from "./dogfood-sidebar-state";
import { DEFAULT_REAL_FLOW_ENDPOINTS } from "./real-flow-client";

export const DOGFOOD_COMMAND_LOG_EVENT = "dogfood-command-submission";
export const DOGFOOD_COMMAND_TYPE = "assistant.command.create";
export const DEFAULT_DOGFOOD_PROVIDER = "openai";
export const DEFAULT_DOGFOOD_CONTEXT_MODE = "ACTIVE_RESOURCE";

export type DogfoodCommandKind = "summarize" | "suggest_edits" | "custom";
export type DogfoodCommandResultStatus = "accepted" | "blocked" | "retryable_error" | "dependency_error" | "failed";
export type DogfoodCommandFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type DogfoodCommandAuthProvider = () => Promise<string>;
export type DogfoodCommandIdProvider = () => string;

export interface DogfoodCommandRequest {
  readonly prompt: string;
  readonly commandKind: DogfoodCommandKind;
  readonly httpBaseUrl: string;
  readonly sessionId: string;
  readonly activeDocumentId: string | null;
  readonly sidebarState: DogfoodSidebarState;
  readonly commandPathTemplate?: string;
  readonly provider?: string;
  readonly contextMode?: "SELECTION" | "ACTIVE_RESOURCE";
}

export interface DogfoodCommandSubmitOptions {
  readonly authProvider: DogfoodCommandAuthProvider;
  readonly fetcher?: DogfoodCommandFetcher;
  readonly idProvider?: DogfoodCommandIdProvider;
  readonly randomIdProvider?: DogfoodCommandIdProvider;
}

export interface DogfoodCommandResult {
  readonly status: DogfoodCommandResultStatus;
  readonly title: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly route: string;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly commandId: string | null;
  readonly errorCode: string | null;
  readonly safeLogEvent: DogfoodCommandSafeLogEvent;
}

export interface DogfoodCommandSafeLogEvent {
  readonly event: typeof DOGFOOD_COMMAND_LOG_EVENT;
  readonly commandKind: DogfoodCommandKind;
  readonly routeTemplate: string;
  readonly route: string;
  readonly hasActiveDocument: boolean;
  readonly inputLength: number;
  readonly resultStatus: DogfoodCommandResultStatus;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly commandIdPresent: boolean;
  readonly errorCode: string | null;
  readonly blockerCodes: readonly string[];
}

const AUTHORIZATION_HEADER = "Authorization";
const JSON_CONTENT_TYPE = "application/json";
const FORBIDDEN_COMMAND_LOG_PATTERNS = [
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
  /screenshot/i,
  /ocr/i,
  /accessibility/i,
  /(^|[^a-z0-9])sk-[a-z0-9]/i
] as const;

export async function submitDogfoodCommand(
  request: DogfoodCommandRequest,
  options: DogfoodCommandSubmitOptions
): Promise<DogfoodCommandResult> {
  const routeTemplate = request.commandPathTemplate ?? DEFAULT_REAL_FLOW_ENDPOINTS.commandCreate;
  const route = materializeCommandPath(routeTemplate, request.sessionId);
  const trimmedPrompt = request.prompt.trim();
  const firstBlocker = firstCommandBlocker(request.sidebarState);

  if (firstBlocker) {
    return commandBlockedResult(request, routeTemplate, route, firstBlocker, null);
  }

  if (!trimmedPrompt) {
    return commandBlockedResult(request, routeTemplate, route, {
      code: "COMMAND_FAILED",
      message: "Enter a prompt before sending a command.",
      area: "command",
      retryable: true
    }, null);
  }

  const commandId = options.idProvider?.() ?? createDogfoodCommandId(options.randomIdProvider);
  const fetcher = options.fetcher ?? defaultDogfoodCommandFetcher;
  let authorization: string;

  try {
    authorization = await options.authProvider();
  } catch {
    return commandBlockedResult(request, routeTemplate, route, {
      code: "PRODUCT_AUTH_REQUIRED",
      message: "Sign in to AI Assist before using the sidebar.",
      area: "auth",
      retryable: true
    }, null);
  }

  if (!authorization.startsWith("Bearer ")) {
    return commandBlockedResult(request, routeTemplate, route, {
      code: "PRODUCT_AUTH_REQUIRED",
      message: "Sign in to AI Assist before using the sidebar.",
      area: "auth",
      retryable: true
    }, null);
  }

  let response: Response;
  try {
    response = await fetcher(joinUrl(request.httpBaseUrl, route), {
      method: "POST",
      headers: {
        [AUTHORIZATION_HEADER]: authorization,
        "Content-Type": JSON_CONTENT_TYPE,
        "Idempotency-Key": commandId
      },
      body: JSON.stringify(createDogfoodCommandBody(request, trimmedPrompt, commandId))
    });
  } catch {
    return commandTransportFailureResult(request, routeTemplate, route, commandId);
  }

  const body = await parseJsonBody(response);
  return mapDogfoodCommandResponse(request, routeTemplate, route, response.status, body);
}

export function createExtensionDogfoodCommandAuthProvider(
  runtime: ExtensionRuntimeAuthBridge
): DogfoodCommandAuthProvider {
  return () => requestExtensionAuthorizationHeader(runtime);
}

export function createDogfoodCommandBody(
  request: DogfoodCommandRequest,
  trimmedPrompt: string,
  commandId: string
): Record<string, unknown> {
  const provider = request.provider ?? DEFAULT_DOGFOOD_PROVIDER;
  const contextMode = request.contextMode ?? DEFAULT_DOGFOOD_CONTEXT_MODE;
  const resourceId = request.activeDocumentId ?? "";

  return {
    commandId,
    commandType: DOGFOOD_COMMAND_TYPE,
    provider,
    resourceId,
    contextMode,
    prompt: trimmedPrompt,
    command: {
      kind: "ASK_ASSISTANT",
      commandKind: request.commandKind,
      contextMode,
      resourceRef: {
        connector: "google_docs",
        resourceId,
        resourceType: "document"
      }
    }
  };
}

export function materializeCommandPath(pathTemplate: string, sessionId: string): string {
  return pathTemplate.replace("{sessionId}", encodeURIComponent(sessionId));
}

export function createDogfoodCommandSafeLogEvent(input: {
  readonly request: DogfoodCommandRequest;
  readonly routeTemplate: string;
  readonly route: string;
  readonly resultStatus: DogfoodCommandResultStatus;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly commandId: string | null;
  readonly errorCode: string | null;
}): DogfoodCommandSafeLogEvent {
  return {
    event: DOGFOOD_COMMAND_LOG_EVENT,
    commandKind: input.request.commandKind,
    routeTemplate: input.routeTemplate,
    route: input.route,
    hasActiveDocument: Boolean(input.request.activeDocumentId),
    inputLength: input.request.prompt.trim().length,
    resultStatus: input.resultStatus,
    httpStatus: input.httpStatus,
    requestId: input.requestId,
    correlationId: input.correlationId,
    commandIdPresent: Boolean(input.commandId),
    errorCode: input.errorCode,
    blockerCodes: input.request.sidebarState.blockers.map((blocker) => blocker.code)
  };
}

export function safeDogfoodCommandLogExcludesForbiddenContent(event: DogfoodCommandSafeLogEvent): boolean {
  const serialized = JSON.stringify(event);
  return FORBIDDEN_COMMAND_LOG_PATTERNS.every((pattern) => !pattern.test(serialized));
}

function firstCommandBlocker(state: DogfoodSidebarState): DogfoodSidebarBlocker | null {
  return (
    state.blockers.find((blocker) => ["auth", "google", "document", "context", "provider", "command"].includes(blocker.area)) ??
    null
  );
}

function commandBlockedResult(
  request: DogfoodCommandRequest,
  routeTemplate: string,
  route: string,
  blocker: DogfoodSidebarBlocker,
  httpStatus: number | null
): DogfoodCommandResult {
  const resultStatus = blocker.area === "provider" ? "dependency_error" : "blocked";
  return {
    status: resultStatus,
    title: resultStatus === "dependency_error" ? "Backend dependency is not ready" : "Command blocked",
    message: blocker.message,
    retryable: blocker.retryable,
    route,
    requestId: null,
    correlationId: null,
    commandId: null,
    errorCode: blocker.code,
    safeLogEvent: createDogfoodCommandSafeLogEvent({
      request,
      routeTemplate,
      route,
      resultStatus,
      httpStatus,
      requestId: null,
      correlationId: null,
      commandId: null,
      errorCode: blocker.code
    })
  };
}

function commandTransportFailureResult(
  request: DogfoodCommandRequest,
  routeTemplate: string,
  route: string,
  commandId: string
): DogfoodCommandResult {
  return {
    status: "retryable_error",
    title: "Command can be retried",
    message: "The backend command route is unavailable from this browser session. Retry after connectivity or deployment readiness is refreshed.",
    retryable: true,
    route,
    requestId: null,
    correlationId: null,
    commandId,
    errorCode: "BACKEND_UNAVAILABLE",
    safeLogEvent: createDogfoodCommandSafeLogEvent({
      request,
      routeTemplate,
      route,
      resultStatus: "retryable_error",
      httpStatus: null,
      requestId: null,
      correlationId: null,
      commandId,
      errorCode: "BACKEND_UNAVAILABLE"
    })
  };
}

function mapDogfoodCommandResponse(
  request: DogfoodCommandRequest,
  routeTemplate: string,
  route: string,
  httpStatus: number,
  body: unknown
): DogfoodCommandResult {
  const envelope = asRecord(body) ?? {};
  const data = asRecord(envelope.data) ?? envelope;
  const error = asRecord(envelope.error) ?? asRecord(data.error);
  const responseStatus = typeof data.status === "string" ? data.status : null;
  const commandId = stringValue(data.commandId) ?? stringValue(data.messageId);
  const requestId = stringValue(envelope.requestId) ?? stringValue(data.requestId);
  const correlationId = stringValue(envelope.correlationId) ?? stringValue(data.correlationId);
  const errorCode = stringValue(error?.code) ?? safeHttpErrorCode(httpStatus);
  const retryable = booleanValue(error?.retryable) ?? (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500);
  const resultStatus = classifyResultStatus(httpStatus, responseStatus, error);

  return {
    status: resultStatus,
    title: titleForStatus(resultStatus),
    message: messageForStatus(resultStatus, errorCode, retryable),
    retryable,
    route,
    requestId,
    correlationId,
    commandId,
    errorCode,
    safeLogEvent: createDogfoodCommandSafeLogEvent({
      request,
      routeTemplate,
      route,
      resultStatus,
      httpStatus,
      requestId,
      correlationId,
      commandId,
      errorCode
    })
  };
}

function classifyResultStatus(
  httpStatus: number,
  responseStatus: string | null,
  error: Record<string, unknown> | null
): DogfoodCommandResultStatus {
  if (httpStatus >= 200 && httpStatus < 300 && (responseStatus === null || responseStatus === "accepted" || responseStatus === "completed")) {
    return "accepted";
  }

  const code = stringValue(error?.code);
  const category = stringValue(error?.category);
  const retryable = booleanValue(error?.retryable) ?? (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500);

  if (category === "DEPENDENCY" || code?.includes("DEPENDENCY") || code?.includes("UNAVAILABLE") || httpStatus === 501 || httpStatus === 503) {
    return "dependency_error";
  }
  if (retryable || httpStatus === 408 || httpStatus === 429) {
    return "retryable_error";
  }
  if (httpStatus === 401 || httpStatus === 403 || responseStatus === "rejected") {
    return "blocked";
  }
  return "failed";
}

function titleForStatus(status: DogfoodCommandResultStatus): string {
  switch (status) {
    case "accepted":
      return "Command accepted";
    case "dependency_error":
      return "Backend dependency is not ready";
    case "retryable_error":
      return "Command can be retried";
    case "blocked":
      return "Command blocked";
    default:
      return "Command failed";
  }
}

function messageForStatus(status: DogfoodCommandResultStatus, errorCode: string | null, retryable: boolean): string {
  if (status === "accepted") {
    return "The backend accepted the command. Assistant output will render when stream or durable session state is available.";
  }
  if (status === "dependency_error") {
    return "A backend dependency is not configured or available yet. No provider call was made by the client.";
  }
  if (status === "retryable_error") {
    return "The backend returned a retryable command error. Retry after readiness is refreshed.";
  }
  if (status === "blocked") {
    return safeBlockedMessage(errorCode, retryable);
  }
  return "The backend could not accept the command. Refresh readiness before trying again.";
}

function safeBlockedMessage(errorCode: string | null, retryable: boolean): string {
  if (errorCode === "AUTHENTICATION_REQUIRED" || errorCode === "AUTHENTICATION_EXPIRED" || errorCode === "PRODUCT_AUTH_REQUIRED") {
    return "Sign in to AI Assist before submitting a command.";
  }
  if (errorCode === "GOOGLE_OAUTH_REQUIRED" || errorCode === "GOOGLE_OAUTH_RECONNECT_REQUIRED" || errorCode === "GOOGLE_OAUTH_BLOCKED") {
    return "Connect or reconnect Google before submitting a command.";
  }
  if (errorCode === "PROVIDER_REQUIRED" || errorCode === "PROVIDER_UNAVAILABLE") {
    return "Provider access must be ready before submitting a command.";
  }
  return retryable ? "Command submission is blocked until readiness is refreshed." : "User action is required before the command can continue.";
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
  return status >= 400 ? "COMMAND_FAILED" : null;
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

function createDogfoodCommandId(randomIdProvider: DogfoodCommandIdProvider | undefined): string {
  const uuid = randomIdProvider?.() ?? globalThis.crypto?.randomUUID?.();
  if (uuid?.trim()) {
    return `cmd_${sanitizeCommandIdPart(uuid)}`;
  }
  return `cmd_${Date.now().toString(36)}_${sanitizeCommandIdPart(Math.random().toString(36).slice(2))}`;
}

function sanitizeCommandIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "_");
}

async function defaultDogfoodCommandFetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
