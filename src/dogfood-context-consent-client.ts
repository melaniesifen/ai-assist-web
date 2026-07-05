import { requestExtensionAuthorizationHeader, type ExtensionRuntimeAuthBridge } from "./product-auth";
import { DEFAULT_REAL_FLOW_ENDPOINTS } from "./real-flow-client";

export const DOGFOOD_CONTEXT_CONSENT_LOG_EVENT = "dogfood-context-consent";

export type DogfoodContextConsentResultStatus = "granted" | "blocked" | "retryable_error" | "dependency_error" | "failed";
export type DogfoodContextConsentFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type DogfoodContextConsentAuthProvider = () => Promise<string>;

export interface DogfoodContextConsentRequest {
  readonly httpBaseUrl: string;
  readonly sessionId: string;
  readonly activeDocumentId: string | null;
  readonly contextConsentPathTemplate?: string;
}

export interface DogfoodContextConsentOptions {
  readonly authProvider: DogfoodContextConsentAuthProvider;
  readonly fetcher?: DogfoodContextConsentFetcher;
}

export interface DogfoodContextConsentResult {
  readonly status: DogfoodContextConsentResultStatus;
  readonly message: string;
  readonly retryable: boolean;
  readonly route: string;
  readonly grantId: string | null;
  readonly errorCode: string | null;
  readonly safeLogEvent: DogfoodContextConsentSafeLogEvent;
}

export interface DogfoodContextConsentSafeLogEvent {
  readonly event: typeof DOGFOOD_CONTEXT_CONSENT_LOG_EVENT;
  readonly routeTemplate: string;
  readonly route: string;
  readonly hasActiveDocument: boolean;
  readonly resultStatus: DogfoodContextConsentResultStatus;
  readonly httpStatus: number | null;
  readonly grantIdPresent: boolean;
  readonly errorCode: string | null;
}

const AUTHORIZATION_HEADER = "Authorization";
const JSON_CONTENT_TYPE = "application/json";
const DEFAULT_CONTEXT_CONSENT_PATH = "/resource-sessions/{sessionId}/context-consent";
const FORBIDDEN_CONSENT_LOG_PATTERNS = [
  /authorization/i,
  /bearer/i,
  /oauth[_ -]?token/i,
  /access[_ -]?token/i,
  /refresh[_ -]?token/i,
  /provider[_ -]?key/i,
  /api[_ -]?key/i,
  /prompt/i,
  /selected[_ -]?text/i,
  /document[_ -]?text/i,
  /model[_ -]?output/i,
  /action[_ -]?payload/i,
  /screenshot/i,
  /ocr/i,
  /accessibility/i
] as const;

export async function ensureDogfoodContextConsent(
  request: DogfoodContextConsentRequest,
  options: DogfoodContextConsentOptions
): Promise<DogfoodContextConsentResult> {
  const routeTemplate =
    request.contextConsentPathTemplate ??
    ("contextConsent" in DEFAULT_REAL_FLOW_ENDPOINTS
      ? DEFAULT_REAL_FLOW_ENDPOINTS.contextConsent
      : DEFAULT_CONTEXT_CONSENT_PATH);
  const route = materializeContextConsentPath(routeTemplate, request.sessionId);
  const resourceId = request.activeDocumentId?.trim();
  if (!resourceId) {
    return contextConsentResult(request, routeTemplate, route, "blocked", null, null, "ACTIVE_DOCUMENT_REQUIRED", true);
  }

  let authorization: string;
  try {
    authorization = await options.authProvider();
  } catch {
    return contextConsentResult(request, routeTemplate, route, "blocked", null, null, "PRODUCT_AUTH_REQUIRED", true);
  }
  if (!authorization.startsWith("Bearer ")) {
    return contextConsentResult(request, routeTemplate, route, "blocked", null, null, "PRODUCT_AUTH_REQUIRED", true);
  }

  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(joinUrl(request.httpBaseUrl, route), {
      method: "POST",
      headers: {
        [AUTHORIZATION_HEADER]: authorization,
        "Content-Type": JSON_CONTENT_TYPE
      },
      body: JSON.stringify({ resourceId })
    });
  } catch {
    return contextConsentResult(request, routeTemplate, route, "retryable_error", null, null, "BACKEND_UNAVAILABLE", true);
  }

  const body = await parseJsonBody(response);
  return mapContextConsentResponse(request, routeTemplate, route, response.status, body);
}

export function createExtensionDogfoodContextConsentAuthProvider(
  runtime: ExtensionRuntimeAuthBridge
): DogfoodContextConsentAuthProvider {
  return () => requestExtensionAuthorizationHeader(runtime);
}

export function materializeContextConsentPath(pathTemplate: string, sessionId: string): string {
  return pathTemplate.replace("{sessionId}", encodeURIComponent(sessionId));
}

export function safeDogfoodContextConsentLogExcludesForbiddenContent(event: DogfoodContextConsentSafeLogEvent): boolean {
  const serialized = JSON.stringify(event);
  return FORBIDDEN_CONSENT_LOG_PATTERNS.every((pattern) => !pattern.test(serialized));
}

function mapContextConsentResponse(
  request: DogfoodContextConsentRequest,
  routeTemplate: string,
  route: string,
  httpStatus: number,
  body: unknown
): DogfoodContextConsentResult {
  const envelope = asRecord(body) ?? {};
  const data = asRecord(envelope.data) ?? envelope;
  const grant = asRecord(data.consentGrant);
  const error = asRecord(envelope.error) ?? asRecord(data.error);
  const errorCode = stringValue(error?.code) ?? safeHttpErrorCode(httpStatus);
  const retryable = booleanValue(error?.retryable) ?? (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500);
  if (httpStatus >= 200 && httpStatus < 300 && grant) {
    const grantId = stringValue(grant.grantId);
    return contextConsentResult(request, routeTemplate, route, "granted", httpStatus, grantId, null, false);
  }
  const status: DogfoodContextConsentResultStatus =
    httpStatus === 403 || errorCode === "GOOGLE_OAUTH_REQUIRED"
      ? "blocked"
      : httpStatus === 501 || httpStatus === 503
        ? "dependency_error"
        : retryable
          ? "retryable_error"
          : "failed";
  return contextConsentResult(request, routeTemplate, route, status, httpStatus, null, errorCode, retryable);
}

function contextConsentResult(
  request: DogfoodContextConsentRequest,
  routeTemplate: string,
  route: string,
  status: DogfoodContextConsentResultStatus,
  httpStatus: number | null,
  grantId: string | null,
  errorCode: string | null,
  retryable: boolean
): DogfoodContextConsentResult {
  return {
    status,
    message: messageForStatus(status, errorCode),
    retryable,
    route,
    grantId,
    errorCode,
    safeLogEvent: {
      event: DOGFOOD_CONTEXT_CONSENT_LOG_EVENT,
      routeTemplate,
      route,
      hasActiveDocument: Boolean(request.activeDocumentId),
      resultStatus: status,
      httpStatus,
      grantIdPresent: Boolean(grantId),
      errorCode
    }
  };
}

function messageForStatus(status: DogfoodContextConsentResultStatus, errorCode: string | null): string {
  if (status === "granted") {
    return "Document context access is ready.";
  }
  if (errorCode === "GOOGLE_OAUTH_REQUIRED") {
    return "Connect Google before granting document context.";
  }
  if (errorCode === "PRODUCT_AUTH_REQUIRED") {
    return "Sign in to AI Assist before granting document context.";
  }
  if (status === "dependency_error") {
    return "Context consent persistence is not ready in the backend.";
  }
  if (status === "retryable_error") {
    return "Context consent can be retried after backend connectivity is refreshed.";
  }
  return "Document context access is blocked.";
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function safeHttpErrorCode(status: number): string | null {
  if (status >= 200 && status < 300) {
    return null;
  }
  if (status === 401) {
    return "PRODUCT_AUTH_REQUIRED";
  }
  if (status === 403) {
    return "CONTEXT_CONSENT_DENIED";
  }
  if (status === 404) {
    return "CONTEXT_CONSENT_ROUTE_NOT_FOUND";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status >= 500) {
    return "CONTEXT_CONSENT_BACKEND_UNAVAILABLE";
  }
  return "CONTEXT_CONSENT_FAILED";
}
