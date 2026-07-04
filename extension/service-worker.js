const CONFIG_STORAGE_KEY = "aiAssistDogfoodConfig";
const DOCUMENT_CONTEXT_STORAGE_KEY = "aiAssistActiveDocumentContext";

chrome.runtime.onInstalled.addListener(async () => {
  const config = await loadDevConfig();
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: config });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) {
    return;
  }

  await updateSidePanelForTab(tabId, tab.url);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AI_ASSIST_DOC_CONTEXT" && sender.tab?.id !== undefined) {
    persistDocumentContext(sender.tab.id, message.context)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }

  if (message?.type === "AI_ASSIST_GET_RUNTIME_CONTEXT") {
    readRuntimeContext()
      .then((context) => sendResponse({ ok: true, context }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }

  return false;
});

async function loadDevConfig() {
  const response = await fetch(chrome.runtime.getURL("config.dev.json")).catch(() => null);

  if (response?.ok) {
    return response.json();
  }

  const fallback = await fetch(chrome.runtime.getURL("config.example.json"));

  if (!fallback.ok) {
    throw new Error(`Unable to load extension config: ${fallback.status}`);
  }

  return fallback.json();
}

async function updateSidePanelForTab(tabId, url) {
  const supported = isSupportedGoogleDocsDocument(url);

  await chrome.sidePanel.setOptions({
    tabId,
    path: "sidepanel.html",
    enabled: supported
  });
}

async function persistDocumentContext(tabId, context) {
  const safeContext = {
    tabId,
    href: typeof context?.href === "string" ? context.href : null,
    documentId: typeof context?.documentId === "string" ? context.documentId : null,
    supported: Boolean(context?.supported),
    updatedAt: new Date().toISOString()
  };

  await chrome.storage.session.set({ [DOCUMENT_CONTEXT_STORAGE_KEY]: safeContext });
}

async function readRuntimeContext() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  const session = await chrome.storage.session.get(DOCUMENT_CONTEXT_STORAGE_KEY);

  return {
    config: stored[CONFIG_STORAGE_KEY] ?? (await loadDevConfig()),
    documentContext: session[DOCUMENT_CONTEXT_STORAGE_KEY] ?? null,
    activeTabUrl: activeTab?.url ?? null
  };
}

function isSupportedGoogleDocsDocument(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === "docs.google.com" && /^\/document\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]+(?:\/|$)/.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}
