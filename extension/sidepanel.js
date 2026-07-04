const DOCUMENT_ID_ELEMENT = document.querySelector("#document-id");
const API_BASE_URL_ELEMENT = document.querySelector("#api-base-url");
const SSE_BASE_URL_ELEMENT = document.querySelector("#sse-base-url");
const ASSISTANT_APP_FRAME = document.querySelector("#assistant-app");

loadRuntimeContext();

async function loadRuntimeContext() {
  const response = await chrome.runtime.sendMessage({ type: "AI_ASSIST_GET_RUNTIME_CONTEXT" });

  if (!response?.ok) {
    renderBridgeError(response?.error ?? "Unable to read extension runtime context.");
    return;
  }

  const { config, documentContext, activeTabUrl } = response.context;
  renderBridge(config, documentContext);
  openAssistantApp(config, documentContext, activeTabUrl);
}

function renderBridge(config, documentContext) {
  DOCUMENT_ID_ELEMENT.textContent = documentContext?.documentId ?? "No supported Google Doc detected.";
  API_BASE_URL_ELEMENT.textContent = config.apiBaseUrl;
  SSE_BASE_URL_ELEMENT.textContent = config.sseBaseUrl;
}

function openAssistantApp(config, documentContext, activeTabUrl) {
  const appUrl = new URL(chrome.runtime.getURL("dist/index.html"));
  appUrl.searchParams.set("documentId", documentContext?.documentId ?? "");
  appUrl.searchParams.set("activeTabUrl", activeTabUrl ?? "");
  appUrl.searchParams.set("apiBaseUrl", config.apiBaseUrl);
  appUrl.searchParams.set("sseBaseUrl", config.sseBaseUrl);
  appUrl.searchParams.set("sessionId", config.defaultSessionId);
  ASSISTANT_APP_FRAME.src = appUrl.toString();
}

function renderBridgeError(message) {
  DOCUMENT_ID_ELEMENT.textContent = message;
  API_BASE_URL_ELEMENT.textContent = "Unavailable";
  SSE_BASE_URL_ELEMENT.textContent = "Unavailable";
}
