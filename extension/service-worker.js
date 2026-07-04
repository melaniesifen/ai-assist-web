const CONFIG_STORAGE_KEY = "aiAssistDogfoodConfig";
const DOCUMENT_CONTEXT_STORAGE_KEY = "aiAssistActiveDocumentContext";
const PRODUCT_AUTH_STORAGE_KEY = "aiAssistProductAuth";
const PRODUCT_AUTH_SCOPES = ["openid", "email", "profile"];
const GOOGLE_OAUTH_STATUS_PATH = "/oauth/google/status";
const GOOGLE_OAUTH_START_PATH = "/oauth/google/start";
let googleOAuthState = notConnectedGoogleState(true);

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

  if (message?.type === "AI_ASSIST_PRODUCT_SIGN_IN") {
    signInWithCognitoHostedUi()
      .then((auth) => sendResponse({ ok: true, auth: publicAuthState(auth) }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }

  if (message?.type === "AI_ASSIST_PRODUCT_SIGN_OUT") {
    signOutProductAuth()
      .then((auth) => sendResponse({ ok: true, auth }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }

  if (message?.type === "AI_ASSIST_PRODUCT_AUTH_STATE") {
    readProductAuthState()
      .then((auth) => sendResponse({ ok: true, auth: publicAuthState(auth) }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }

  if (message?.type === "AI_ASSIST_GET_AUTHORIZATION_HEADER") {
    readAuthorizationHeader()
      .then((authorization) => sendResponse({ ok: true, authorization }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }

  if (message?.type === "AI_ASSIST_GOOGLE_OAUTH_STATUS") {
    readGoogleOAuthStatus()
      .then((googleOAuth) => sendResponse({ ok: true, googleOAuth: publicGoogleOAuthState(googleOAuth) }))
      .catch((error) => sendResponse({ ok: false, error: safeErrorMessage(error) }));
    return true;
  }

  if (message?.type === "AI_ASSIST_GOOGLE_CONNECT") {
    startGoogleOAuthConnect()
      .then((googleOAuth) => sendResponse({ ok: true, googleOAuth: publicGoogleOAuthState(googleOAuth) }))
      .catch((error) => sendResponse({ ok: false, error: safeErrorMessage(error) }));
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
  const auth = await readProductAuthState();

  return {
    config: stored[CONFIG_STORAGE_KEY] ?? (await loadDevConfig()),
    documentContext: session[DOCUMENT_CONTEXT_STORAGE_KEY] ?? null,
    activeTabUrl: activeTab?.url ?? null,
    productAuth: publicAuthState(auth),
    googleOAuth: publicGoogleOAuthState(await readGoogleOAuthStatus(stored[CONFIG_STORAGE_KEY]))
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

async function signInWithCognitoHostedUi() {
  const config = await loadConfigFromStorage();
  const expectedState = crypto.randomUUID();
  const authUrl = createHostedUiUrl(config, expectedState);
  const redirectUrl = await launchWebAuthFlow(authUrl);
  const auth = parseHostedUiRedirect(redirectUrl, expectedState);

  if (auth.status === "signed_in") {
    await chrome.storage.session.set({ [PRODUCT_AUTH_STORAGE_KEY]: auth });
  } else {
    await chrome.storage.session.remove(PRODUCT_AUTH_STORAGE_KEY);
  }

  return auth;
}

async function signOutProductAuth() {
  const config = await loadConfigFromStorage();
  await chrome.storage.session.remove(PRODUCT_AUTH_STORAGE_KEY);

  if (hasCognitoConfig(config)) {
    await launchWebAuthFlow(createLogoutUrl(config), false).catch(() => null);
  }

  return {
    status: "signed_out",
    displayName: "Signed out",
    message: "Sign in with Cognito before connecting Google."
  };
}

async function readProductAuthState() {
  const stored = await chrome.storage.session.get(PRODUCT_AUTH_STORAGE_KEY);
  const auth = stored[PRODUCT_AUTH_STORAGE_KEY];

  if (!auth?.tokens?.idToken) {
    return {
      status: "signed_out",
      displayName: "Signed out",
      message: "Sign in with Cognito before connecting Google."
    };
  }

  if (Number(auth.tokens.expiresAtEpochMs) <= Date.now()) {
    await chrome.storage.session.remove(PRODUCT_AUTH_STORAGE_KEY);
    return {
      status: "auth_expired",
      displayName: "Auth expired",
      message: "Product login expired. Sign in again before using backend routes."
    };
  }

  return auth;
}

async function readAuthorizationHeader() {
  const auth = await readProductAuthState();
  if (auth.status !== "signed_in" || !auth.tokens?.idToken) {
    return null;
  }
  return `Bearer ${auth.tokens.idToken}`;
}

async function readGoogleOAuthStatus(config) {
  const auth = await readProductAuthState();
  if (auth.status === "auth_expired") {
    googleOAuthState = authExpiredGoogleState();
    return googleOAuthState;
  }
  if (auth.status !== "signed_in") {
    googleOAuthState = notConnectedGoogleState(true);
    return googleOAuthState;
  }

  try {
    const runtimeConfig = config ?? (await loadConfigFromStorage());
    const response = await fetch(joinUrl(runtimeConfig.apiBaseUrl, GOOGLE_OAUTH_STATUS_PATH), {
      method: "GET",
      headers: {
        Authorization: await readAuthorizationHeader()
      }
    });
    googleOAuthState = mapGoogleOAuthStatusResponse(response.status, await safeJson(response));
    return googleOAuthState;
  } catch {
    googleOAuthState = dependencyErrorGoogleState();
    return googleOAuthState;
  }
}

async function startGoogleOAuthConnect() {
  const config = await loadConfigFromStorage();
  const authorization = await readAuthorizationHeader();
  if (!authorization) {
    googleOAuthState = authExpiredGoogleState();
    return googleOAuthState;
  }

  googleOAuthState = connectingGoogleState();
  const response = await fetch(joinUrl(config.apiBaseUrl, GOOGLE_OAUTH_START_PATH), {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ redirectTarget: googleOAuthRedirectTarget(config) })
  });
  const body = await safeJson(response);

  if (!response.ok || typeof body?.authorizationUrl !== "string") {
    googleOAuthState = mapGoogleOAuthStatusResponse(response.status, body);
    return googleOAuthState;
  }

  try {
    await launchWebAuthFlow(body.authorizationUrl);
  } catch {
    googleOAuthState = accessDeniedGoogleState();
    return googleOAuthState;
  }
  return readGoogleOAuthStatus(config);
}

async function loadConfigFromStorage() {
  const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  return stored[CONFIG_STORAGE_KEY] ?? (await loadDevConfig());
}

function createHostedUiUrl(config, state) {
  assertCognitoConfig(config);
  const url = new URL("/oauth2/authorize", trimTrailingSlash(config.cognitoAuthBaseUrl));
  url.searchParams.set("client_id", config.cognitoClientId);
  url.searchParams.set("redirect_uri", config.cognitoRedirectUri);
  url.searchParams.set("response_type", config.cognitoResponseType ?? "token");
  url.searchParams.set("scope", Array.isArray(config.cognitoScopes) ? config.cognitoScopes.join(" ") : PRODUCT_AUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

function createLogoutUrl(config) {
  assertCognitoConfig(config);
  const url = new URL("/logout", trimTrailingSlash(config.cognitoAuthBaseUrl));
  url.searchParams.set("client_id", config.cognitoClientId);
  url.searchParams.set("logout_uri", config.cognitoLogoutRedirectUri ?? config.cognitoRedirectUri);
  return url.toString();
}

function parseHostedUiRedirect(redirectUrl, expectedState) {
  const url = new URL(redirectUrl);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.search);

  if (!expectedState || params.get("state") !== expectedState) {
    return {
      status: "access_denied",
      displayName: "Access denied",
      message: "Cognito sign-in response did not match this browser sign-in attempt.",
      errorCode: "state_mismatch"
    };
  }

  const error = params.get("error");

  if (error) {
    return {
      status: error === "access_denied" ? "access_denied" : "signed_out",
      displayName: error === "access_denied" ? "Access denied" : "Signed out",
      message: params.get("error_description") ?? "Cognito did not complete sign-in.",
      errorCode: error
    };
  }

  const idToken = params.get("id_token");
  const accessToken = params.get("access_token");
  const expiresInSeconds = Number(params.get("expires_in") ?? "3600");

  if (!idToken) {
    return {
      status: "signed_out",
      displayName: "Signed out",
      message: "Cognito sign-in did not return a usable product identity token.",
      errorCode: "id_token_required"
    };
  }

  return {
    status: "signed_in",
    displayName: "Signed in",
    message: "Product login is active. Google OAuth remains a separate next step.",
    tokens: {
      idToken,
      accessToken,
      expiresAtEpochMs: Date.now() + Math.max(0, expiresInSeconds) * 1000
    }
  };
}

function publicAuthState(auth) {
  const { tokens: _tokens, ...publicAuth } = auth ?? {};
  return publicAuth.status
    ? publicAuth
    : {
        status: "signed_out",
        displayName: "Signed out",
        message: "Sign in with Cognito before connecting Google."
      };
}

function publicGoogleOAuthState(googleOAuth) {
  return googleOAuth?.status ? googleOAuth : notConnectedGoogleState(true);
}

function launchWebAuthFlow(url, interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!redirectUrl) {
        reject(new Error("Cognito sign-in did not return a redirect URL."));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

function assertCognitoConfig(config) {
  if (!hasCognitoConfig(config)) {
    throw new Error("Cognito Hosted UI base URL, client ID, and redirect URI are required.");
  }
}

function hasCognitoConfig(config) {
  return Boolean(config?.cognitoAuthBaseUrl && config?.cognitoClientId && config?.cognitoRedirectUri);
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function googleOAuthRedirectTarget(config) {
  return config.googleOAuthRedirectTarget ?? config.cognitoRedirectUri ?? config.supportingWebOrigin;
}

function mapGoogleOAuthStatusResponse(httpStatus, body) {
  if (httpStatus === 401 || body?.error?.code === "AUTHENTICATION_REQUIRED" || body?.error?.code === "AUTHENTICATION_EXPIRED") {
    return authExpiredGoogleState();
  }
  if (httpStatus === 403 || body?.error?.code === "AUTHORIZATION_DENIED" || body?.error?.code === "OAUTH_EXCHANGE_FAILED") {
    return accessDeniedGoogleState();
  }
  if (httpStatus >= 500 || body?.error) {
    return dependencyErrorGoogleState();
  }
  if (body?.connected === true) {
    return {
      status: "connected",
      displayName: "Google connected",
      message: "Google connection is active for this signed-in product user.",
      connected: true
    };
  }
  if (Array.isArray(body?.accounts) && body.accounts.some((account) => account?.reconnectRequired || account?.status === "reconnect_required" || account?.status === "revoked")) {
    return reconnectRequiredGoogleState();
  }
  return notConnectedGoogleState(false);
}

function notConnectedGoogleState(disabled) {
  return {
    status: "not_connected",
    displayName: "Google not connected",
    message: disabled ? "Sign in to the product before connecting Google." : "Connect Google before reading the active document.",
    connected: false,
    disabled
  };
}

function connectingGoogleState() {
  return {
    status: "connecting",
    displayName: "Connecting Google",
    message: "Google authorization is open.",
    connected: false
  };
}

function reconnectRequiredGoogleState() {
  return {
    status: "reconnect_required",
    displayName: "Reconnect Google",
    message: "Reconnect Google before using this document.",
    connected: false
  };
}

function accessDeniedGoogleState() {
  return {
    status: "access_denied",
    displayName: "Google access denied",
    message: "Google authorization was denied or this user is not allowed.",
    connected: false
  };
}

function authExpiredGoogleState() {
  return {
    status: "auth_expired",
    displayName: "Product auth expired",
    message: "Sign in again before connecting Google.",
    connected: false
  };
}

function dependencyErrorGoogleState() {
  return {
    status: "dependency_error",
    displayName: "Google status unavailable",
    message: "A connected service is unavailable. Retry later.",
    connected: false
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function safeErrorMessage(error) {
  return String(error?.message ?? error).replace(/Bearer\s+[^ \n]+/gi, "Bearer [redacted]");
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
