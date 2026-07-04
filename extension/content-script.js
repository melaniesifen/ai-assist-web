const GOOGLE_DOCS_DOCUMENT_ID_PATTERN = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/|$)/;

function detectDocumentContext() {
  const match = GOOGLE_DOCS_DOCUMENT_ID_PATTERN.exec(window.location.pathname);

  return {
    href: window.location.href,
    documentId: match?.[1] ?? null,
    supported: Boolean(match?.[1])
  };
}

function publishDocumentContext() {
  chrome.runtime.sendMessage({
    type: "AI_ASSIST_DOC_CONTEXT",
    context: detectDocumentContext()
  });
}

publishDocumentContext();
window.addEventListener("popstate", publishDocumentContext);
