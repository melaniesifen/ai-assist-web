const DOCUMENT_ID_ELEMENT = document.querySelector("#document-id");
const API_BASE_URL_ELEMENT = document.querySelector("#api-base-url");
const SSE_BASE_URL_ELEMENT = document.querySelector("#sse-base-url");
const PRODUCT_AUTH_STATUS_ELEMENT = document.querySelector("#product-auth-status");
const PRODUCT_SIGN_IN_BUTTON = document.querySelector("#product-sign-in");
const PRODUCT_SIGN_OUT_BUTTON = document.querySelector("#product-sign-out");
const GOOGLE_OAUTH_STATUS_ELEMENT = document.querySelector("#google-oauth-status");
const GOOGLE_CONNECT_BUTTON = document.querySelector("#google-connect");
const ASSISTANT_APP_FRAME = document.querySelector("#assistant-app");
const GOOGLE_OAUTH_POLL_INTERVAL_MS = 2000;
const GOOGLE_OAUTH_POLL_ATTEMPTS = 30;

PRODUCT_SIGN_IN_BUTTON.addEventListener("click", () => runProductAuthAction("AI_ASSIST_PRODUCT_SIGN_IN"));
PRODUCT_SIGN_OUT_BUTTON.addEventListener("click", () => runProductAuthAction("AI_ASSIST_PRODUCT_SIGN_OUT"));
GOOGLE_CONNECT_BUTTON.addEventListener("click", () => runGoogleConnectAction());

loadRuntimeContext();

async function loadRuntimeContext() {
  const response = await chrome.runtime.sendMessage({ type: "AI_ASSIST_GET_RUNTIME_CONTEXT" });

  if (!response?.ok) {
    renderBridgeError(response?.error ?? "Unable to read extension runtime context.");
    return;
  }

  const { config, documentContext, activeTabUrl } = response.context;
  renderBridge(config, documentContext, response.context.productAuth, response.context.googleOAuth);
  openAssistantApp(config, documentContext, activeTabUrl, response.context.productAuth, response.context.googleOAuth);
}

function renderBridge(config, documentContext, productAuth, googleOAuth) {
  DOCUMENT_ID_ELEMENT.textContent = documentContext?.documentId ?? "No supported Google Doc detected.";
  API_BASE_URL_ELEMENT.textContent = config.apiBaseUrl;
  SSE_BASE_URL_ELEMENT.textContent = config.sseBaseUrl;
  PRODUCT_AUTH_STATUS_ELEMENT.textContent = formatProductAuthStatus(productAuth);
  GOOGLE_OAUTH_STATUS_ELEMENT.textContent = formatGoogleOAuthStatus(googleOAuth);
  GOOGLE_CONNECT_BUTTON.disabled = productAuth?.status !== "signed_in" || googleOAuth?.status === "connecting";
  GOOGLE_CONNECT_BUTTON.textContent = googleOAuth?.status === "reconnect_required" ? "Reconnect Google" : "Connect Google";
}

function openAssistantApp(config, documentContext, activeTabUrl, productAuth, googleOAuth) {
  const appUrl = new URL(chrome.runtime.getURL("dist/index.html"));
  const canAttemptBackendCommand =
    productAuth?.status === "signed_in" && googleOAuth?.status === "connected" && Boolean(documentContext?.documentId);
  appUrl.searchParams.set("documentId", documentContext?.documentId ?? "");
  appUrl.searchParams.set("activeTabUrl", activeTabUrl ?? "");
  appUrl.searchParams.set("apiBaseUrl", config.apiBaseUrl);
  appUrl.searchParams.set("sseBaseUrl", config.sseBaseUrl);
  appUrl.searchParams.set("sessionId", config.defaultSessionId);
  appUrl.searchParams.set("productAuthStatus", productAuth?.status ?? "signed_out");
  appUrl.searchParams.set("googleOAuthStatus", googleOAuth?.status ?? "not_connected");
  appUrl.searchParams.set("contextStatus", canAttemptBackendCommand ? "ready" : "idle");
  appUrl.searchParams.set("providerStatus", canAttemptBackendCommand ? "ready" : "unknown");
  appUrl.searchParams.set("commandStatus", canAttemptBackendCommand ? "ready" : "idle");
  appUrl.searchParams.set("streamStatus", canAttemptBackendCommand ? "open" : "disconnected");
  appUrl.searchParams.set("proposedActionsStatus", "none");
  appUrl.searchParams.set("applyStatus", "blocked");
  ASSISTANT_APP_FRAME.src = appUrl.toString();
}

function renderBridgeError(message) {
  DOCUMENT_ID_ELEMENT.textContent = message;
  API_BASE_URL_ELEMENT.textContent = "Unavailable";
  SSE_BASE_URL_ELEMENT.textContent = "Unavailable";
  PRODUCT_AUTH_STATUS_ELEMENT.textContent = "Unavailable";
  GOOGLE_OAUTH_STATUS_ELEMENT.textContent = "Unavailable";
  GOOGLE_CONNECT_BUTTON.disabled = true;
}

async function runProductAuthAction(type) {
  PRODUCT_AUTH_STATUS_ELEMENT.textContent = type === "AI_ASSIST_PRODUCT_SIGN_IN" ? "Opening Cognito..." : "Signing out...";
  const response = await chrome.runtime.sendMessage({ type });

  if (!response?.ok) {
    PRODUCT_AUTH_STATUS_ELEMENT.textContent = response?.error ?? "Product login action failed.";
    return;
  }

  await loadRuntimeContext();
}

async function runGoogleConnectAction() {
  GOOGLE_OAUTH_STATUS_ELEMENT.textContent = "Opening Google authorization...";
  GOOGLE_CONNECT_BUTTON.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "AI_ASSIST_GOOGLE_CONNECT" });

  if (!response?.ok) {
    GOOGLE_OAUTH_STATUS_ELEMENT.textContent = response?.error ?? "Google connect failed.";
    GOOGLE_CONNECT_BUTTON.disabled = false;
    return;
  }

  if (response.googleOAuth?.status && response.googleOAuth.status !== "connected") {
    GOOGLE_OAUTH_STATUS_ELEMENT.textContent = formatGoogleOAuthStatus(response.googleOAuth);
    await pollGoogleOAuthStatus();
    return;
  }

  await loadRuntimeContext();
}

async function pollGoogleOAuthStatus() {
  for (let attempt = 0; attempt < GOOGLE_OAUTH_POLL_ATTEMPTS; attempt += 1) {
    await delay(GOOGLE_OAUTH_POLL_INTERVAL_MS);
    const response = await chrome.runtime.sendMessage({ type: "AI_ASSIST_GOOGLE_OAUTH_STATUS" });
    const googleOAuth = response?.googleOAuth;

    if (!response?.ok || !googleOAuth?.status) {
      GOOGLE_OAUTH_STATUS_ELEMENT.textContent = response?.error ?? "Unable to refresh Google status.";
      GOOGLE_CONNECT_BUTTON.disabled = false;
      return;
    }

    GOOGLE_OAUTH_STATUS_ELEMENT.textContent = formatGoogleOAuthStatus(googleOAuth);
    if (googleOAuth.status === "connected") {
      await loadRuntimeContext();
      return;
    }
    if (!["connecting", "not_connected"].includes(googleOAuth.status)) {
      GOOGLE_CONNECT_BUTTON.disabled = false;
      return;
    }
  }

  GOOGLE_OAUTH_STATUS_ELEMENT.textContent = "Still waiting for Google connection. Reopen the sidebar to refresh.";
  GOOGLE_CONNECT_BUTTON.disabled = false;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatProductAuthStatus(productAuth) {
  if (!productAuth?.status) {
    return "Signed out";
  }

  if (productAuth.status === "signed_in") {
    return "Signed in. Google connection is separate.";
  }

  if (productAuth.status === "auth_expired") {
    return "Expired. Sign in again.";
  }

  if (productAuth.status === "access_denied") {
    return "Access denied for this dev user.";
  }

  return productAuth.message ?? productAuth.displayName ?? "Signed out";
}

function formatGoogleOAuthStatus(googleOAuth) {
  if (!googleOAuth?.status) {
    return "Not connected.";
  }

  if (googleOAuth.status === "connected") {
    return "Connected.";
  }

  if (googleOAuth.status === "connecting") {
    return "Connecting...";
  }

  if (googleOAuth.status === "reconnect_required") {
    return "Reconnect required.";
  }

  if (googleOAuth.status === "access_denied") {
    return "Access denied.";
  }

  if (googleOAuth.status === "auth_expired") {
    return "Product auth expired.";
  }

  if (googleOAuth.status === "dependency_error") {
    return "Service unavailable. Retry later.";
  }

  return googleOAuth.message ?? googleOAuth.displayName ?? "Not connected.";
}
