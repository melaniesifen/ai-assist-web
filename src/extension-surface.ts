export const EXTENSION_SURFACE_STATES = Object.freeze({
  READY: "READY",
  UNSUPPORTED_PAGE: "UNSUPPORTED_PAGE",
  MISSING_DOCUMENT_ID: "MISSING_DOCUMENT_ID"
});

export type ExtensionSurfaceState =
  (typeof EXTENSION_SURFACE_STATES)[keyof typeof EXTENSION_SURFACE_STATES];

export const EXTENSION_CLIENT_RESPONSIBILITIES = Object.freeze([
  "Detect supported Google Docs pages before injecting UI.",
  "Host the primary assistant UI in a browser sidebar or side panel tied to the active document.",
  "Keep any floating in-document affordance optional and later than the M2 primary side-panel surface.",
  "Detect and send the current Google Docs document ID as resource metadata.",
  "Keep raw prompts, document text, model responses, and action payloads only in active user-visible state."
] as const);

export const EXTENSION_BACKEND_RESPONSIBILITIES = Object.freeze([
  "Own product authentication and Google OAuth token handling.",
  "Own provider credential validation and model-provider calls.",
  "Own authenticated HTTP command APIs and SSE session streams.",
  "Own proposed-action storage, approval, idempotent apply-action, and status events.",
  "Own all Google Docs read and mutation API calls through backend services."
] as const);

export const FORBIDDEN_EXTENSION_RETENTION = Object.freeze([
  "provider API keys",
  "OAuth tokens",
  "bearer tokens",
  "raw prompts",
  "selected text",
  "document text",
  "model responses",
  "screenshots",
  "OCR text",
  "accessibility-tree content",
  "action payloads"
] as const);

export type GoogleDocsExtensionSurfaceInput = {
  url?: string;
};

export type GoogleDocsExtensionSurface = {
  state: ExtensionSurfaceState;
  documentId: string | null;
  canInjectFloatingButton: boolean;
  canOpenAssistantPanel: boolean;
  userMessage: string;
  clientResponsibilities: typeof EXTENSION_CLIENT_RESPONSIBILITIES;
  backendResponsibilities: typeof EXTENSION_BACKEND_RESPONSIBILITIES;
  forbiddenLocalRetention: typeof FORBIDDEN_EXTENSION_RETENTION;
};

const GOOGLE_DOCS_HOST = "docs.google.com";
const DOCUMENT_PATH_PREFIX = "/document/";
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DOCUMENT_ID_PATH_PATTERN = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/|$)/;

export function describeGoogleDocsExtensionSurface({
  url
}: GoogleDocsExtensionSurfaceInput = {}): GoogleDocsExtensionSurface {
  const parsedUrl = parseUrl(url);

  if (!parsedUrl || parsedUrl.hostname !== GOOGLE_DOCS_HOST || !parsedUrl.pathname.startsWith(DOCUMENT_PATH_PREFIX)) {
    return createSurfaceState({
      state: EXTENSION_SURFACE_STATES.UNSUPPORTED_PAGE,
      documentId: null,
      userMessage: "Open a supported Google Docs document to use the assistant."
    });
  }

  const documentId = extractGoogleDocumentId(parsedUrl);

  if (documentId === null) {
    return createSurfaceState({
      state: EXTENSION_SURFACE_STATES.MISSING_DOCUMENT_ID,
      documentId: null,
      userMessage: "The assistant could not identify the current Google Doc."
    });
  }

  return createSurfaceState({
    state: EXTENSION_SURFACE_STATES.READY,
    documentId,
    userMessage: "Assistant ready for this Google Doc."
  });
}

function createSurfaceState({
  state,
  documentId,
  userMessage
}: {
  state: ExtensionSurfaceState;
  documentId: string | null;
  userMessage: string;
}): GoogleDocsExtensionSurface {
  const isReady = state === EXTENSION_SURFACE_STATES.READY;

  return {
    state,
    documentId,
    canInjectFloatingButton: false,
    canOpenAssistantPanel: isReady,
    userMessage,
    clientResponsibilities: EXTENSION_CLIENT_RESPONSIBILITIES,
    backendResponsibilities: EXTENSION_BACKEND_RESPONSIBILITIES,
    forbiddenLocalRetention: FORBIDDEN_EXTENSION_RETENTION
  };
}

function parseUrl(url: string | undefined): URL | null {
  if (typeof url !== "string") {
    return null;
  }

  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function extractGoogleDocumentId(url: URL): string | null {
  const match = DOCUMENT_ID_PATH_PATTERN.exec(url.pathname);
  const candidate = match?.[1];

  return candidate && DOCUMENT_ID_PATTERN.test(candidate) ? candidate : null;
}
