const CONFIG_STORAGE_KEY = "aiAssistDogfoodConfig";
const DOCUMENT_CONTEXT_STORAGE_KEY = "aiAssistActiveDocumentContext";

browser.runtime.onInstalled.addListener(async () => {
  const config = await loadDevConfig();
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: config });
});

browser.browserAction.onClicked.addListener(async () => {
  await browser.sidebarAction.open();
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "AI_ASSIST_DOC_CONTEXT" && sender.tab?.id !== undefined) {
    return persistDocumentContext(sender.tab.id, message.context).then(() => ({ ok: true }));
  }

  if (message?.type === "AI_ASSIST_GET_RUNTIME_CONTEXT") {
    return readRuntimeContext().then((context) => ({ ok: true, context }));
  }

  return false;
});

async function loadDevConfig() {
  const response = await fetch(browser.runtime.getURL("config.dev.json")).catch(() => null);

  if (response?.ok) {
    return response.json();
  }

  const fallback = await fetch(browser.runtime.getURL("config.example.json"));

  if (!fallback.ok) {
    throw new Error(`Unable to load extension config: ${fallback.status}`);
  }

  return fallback.json();
}

async function persistDocumentContext(tabId, context) {
  const safeContext = {
    tabId,
    href: typeof context?.href === "string" ? context.href : null,
    documentId: typeof context?.documentId === "string" ? context.documentId : null,
    supported: Boolean(context?.supported),
    updatedAt: new Date().toISOString()
  };

  await browser.storage.local.set({ [DOCUMENT_CONTEXT_STORAGE_KEY]: safeContext });
}

async function readRuntimeContext() {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  const stored = await browser.storage.local.get(CONFIG_STORAGE_KEY);
  const session = await browser.storage.local.get(DOCUMENT_CONTEXT_STORAGE_KEY);

  return {
    config: stored[CONFIG_STORAGE_KEY] ?? (await loadDevConfig()),
    documentContext: session[DOCUMENT_CONTEXT_STORAGE_KEY] ?? null,
    activeTabUrl: activeTab?.url ?? null
  };
}
