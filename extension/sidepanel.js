const DOCUMENT_ID_ELEMENT = document.querySelector("#document-id");
const API_BASE_URL_ELEMENT = document.querySelector("#api-base-url");
const SSE_BASE_URL_ELEMENT = document.querySelector("#sse-base-url");
const PRODUCT_AUTH_STATUS_ELEMENT = document.querySelector("#product-auth-status");
const PRODUCT_SIGN_IN_BUTTON = document.querySelector("#product-sign-in");
const PRODUCT_SIGN_OUT_BUTTON = document.querySelector("#product-sign-out");
const ASSISTANT_APP_FRAME = document.querySelector("#assistant-app");

PRODUCT_SIGN_IN_BUTTON.addEventListener("click", () => runProductAuthAction("AI_ASSIST_PRODUCT_SIGN_IN"));
PRODUCT_SIGN_OUT_BUTTON.addEventListener("click", () => runProductAuthAction("AI_ASSIST_PRODUCT_SIGN_OUT"));

loadRuntimeContext();

async function loadRuntimeContext() {
  const response = await chrome.runtime.sendMessage({ type: "AI_ASSIST_GET_RUNTIME_CONTEXT" });

  if (!response?.ok) {
    renderBridgeError(response?.error ?? "Unable to read extension runtime context.");
    return;
  }

  const { config, documentContext, activeTabUrl } = response.context;
  renderBridge(config, documentContext, response.context.productAuth);
  openAssistantApp(config, documentContext, activeTabUrl, response.context.productAuth);
}

function renderBridge(config, documentContext, productAuth) {
  DOCUMENT_ID_ELEMENT.textContent = documentContext?.documentId ?? "No supported Google Doc detected.";
  API_BASE_URL_ELEMENT.textContent = config.apiBaseUrl;
  SSE_BASE_URL_ELEMENT.textContent = config.sseBaseUrl;
  PRODUCT_AUTH_STATUS_ELEMENT.textContent = formatProductAuthStatus(productAuth);
}

function openAssistantApp(config, documentContext, activeTabUrl, productAuth) {
  const appUrl = new URL(chrome.runtime.getURL("dist/index.html"));
  appUrl.searchParams.set("documentId", documentContext?.documentId ?? "");
  appUrl.searchParams.set("activeTabUrl", activeTabUrl ?? "");
  appUrl.searchParams.set("apiBaseUrl", config.apiBaseUrl);
  appUrl.searchParams.set("sseBaseUrl", config.sseBaseUrl);
  appUrl.searchParams.set("sessionId", config.defaultSessionId);
  appUrl.searchParams.set("productAuthStatus", productAuth?.status ?? "signed_out");
  ASSISTANT_APP_FRAME.src = appUrl.toString();
}

function renderBridgeError(message) {
  DOCUMENT_ID_ELEMENT.textContent = message;
  API_BASE_URL_ELEMENT.textContent = "Unavailable";
  SSE_BASE_URL_ELEMENT.textContent = "Unavailable";
  PRODUCT_AUTH_STATUS_ELEMENT.textContent = "Unavailable";
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
