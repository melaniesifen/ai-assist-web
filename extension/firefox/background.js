const CONFIG_STORAGE_KEY = "aiAssistDogfoodConfig";
const DOCUMENT_CONTEXT_STORAGE_KEY = "aiAssistActiveDocumentContext";
const DOCUMENT_CONTEXTS_BY_TAB_STORAGE_KEY = "aiAssistDocumentContextsByTab";
const PRODUCT_AUTH_SCOPES = ["openid", "email", "profile"];
const GOOGLE_OAUTH_STATUS_PATH = "/oauth/google/status";
const GOOGLE_OAUTH_START_PATH = "/oauth/google/start";
const GOOGLE_DOCS_DOCUMENT_ID_PATTERN = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/|$)/;
let productAuthState = {
  status: "signed_out",
  displayName: "Signed out",
  message: "Sign in with Cognito before connecting Google."
};
let googleOAuthState = notConnectedGoogleState(true);

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

  if (message?.type === "AI_ASSIST_PRODUCT_SIGN_IN") {
    return signInWithCognitoHostedUi().then((auth) => ({ ok: true, auth: publicAuthState(auth) }));
  }

  if (message?.type === "AI_ASSIST_PRODUCT_SIGN_OUT") {
    return signOutProductAuth().then((auth) => ({ ok: true, auth }));
  }

  if (message?.type === "AI_ASSIST_PRODUCT_AUTH_STATE") {
    return readProductAuthState().then((auth) => ({ ok: true, auth: publicAuthState(auth) }));
  }

  if (message?.type === "AI_ASSIST_GET_AUTHORIZATION_HEADER") {
    return readAuthorizationHeader().then((authorization) => ({ ok: true, authorization }));
  }

  if (message?.type === "AI_ASSIST_GOOGLE_OAUTH_STATUS") {
    return readGoogleOAuthStatus()
      .then((googleOAuth) => ({ ok: true, googleOAuth: publicGoogleOAuthState(googleOAuth) }))
      .catch((error) => ({ ok: false, error: safeErrorMessage(error) }));
  }

  if (message?.type === "AI_ASSIST_GOOGLE_CONNECT") {
    return startGoogleOAuthConnect()
      .then((googleOAuth) => ({ ok: true, googleOAuth: publicGoogleOAuthState(googleOAuth) }))
      .catch((error) => ({ ok: false, error: safeErrorMessage(error) }));
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

  const stored = await browser.storage.local.get([DOCUMENT_CONTEXT_STORAGE_KEY, DOCUMENT_CONTEXTS_BY_TAB_STORAGE_KEY]);
  const contextsByTab = stored[DOCUMENT_CONTEXTS_BY_TAB_STORAGE_KEY] ?? {};
  await browser.storage.local.set({
    [DOCUMENT_CONTEXT_STORAGE_KEY]: safeContext,
    [DOCUMENT_CONTEXTS_BY_TAB_STORAGE_KEY]: {
      ...contextsByTab,
      [String(tabId)]: safeContext
    }
  });
}

async function readRuntimeContext() {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  const stored = await browser.storage.local.get(CONFIG_STORAGE_KEY);
  const session = await browser.storage.local.get([DOCUMENT_CONTEXT_STORAGE_KEY, DOCUMENT_CONTEXTS_BY_TAB_STORAGE_KEY]);
  const auth = await readProductAuthState();

  return {
    config: stored[CONFIG_STORAGE_KEY] ?? (await loadDevConfig()),
    documentContext: documentContextForActiveTab(activeTab, session[DOCUMENT_CONTEXTS_BY_TAB_STORAGE_KEY] ?? {}, session[DOCUMENT_CONTEXT_STORAGE_KEY]),
    activeTabUrl: activeTab?.url ?? null,
    productAuth: publicAuthState(auth),
    googleOAuth: publicGoogleOAuthState(await readGoogleOAuthStatus(stored[CONFIG_STORAGE_KEY]))
  };
}

function documentContextForActiveTab(activeTab, contextsByTab, legacyContext) {
  if (!activeTab?.id) {
    return null;
  }

  const detected = detectDocumentContextFromUrl(activeTab.url, activeTab.id);
  if (!detected.supported) {
    return null;
  }

  const storedForTab = contextsByTab[String(activeTab.id)] ?? (legacyContext?.tabId === activeTab.id ? legacyContext : null);
  return {
    ...detected,
    updatedAt: storedForTab?.updatedAt ?? new Date().toISOString()
  };
}

function detectDocumentContextFromUrl(url, tabId) {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.hostname === "docs.google.com" ? GOOGLE_DOCS_DOCUMENT_ID_PATTERN.exec(parsedUrl.pathname) : null;

    return {
      tabId,
      href: typeof url === "string" ? url : null,
      documentId: match?.[1] ?? null,
      supported: Boolean(match?.[1])
    };
  } catch {
    return {
      tabId,
      href: null,
      documentId: null,
      supported: false
    };
  }
}

async function signInWithCognitoHostedUi() {
  const config = await loadConfigFromStorage();
  const expectedState = crypto.randomUUID();
  const redirectUrl = await browser.identity.launchWebAuthFlow({
    url: createHostedUiUrl(config, expectedState),
    interactive: true
  });
  productAuthState = parseHostedUiRedirect(redirectUrl, expectedState);
  return productAuthState;
}

async function signOutProductAuth() {
  const config = await loadConfigFromStorage();
  productAuthState = {
    status: "signed_out",
    displayName: "Signed out",
    message: "Sign in with Cognito before connecting Google."
  };

  if (hasCognitoConfig(config)) {
    await browser.identity
      .launchWebAuthFlow({
        url: createLogoutUrl(config),
        interactive: false
      })
      .catch(() => null);
  }

  return productAuthState;
}

async function readProductAuthState() {
  if (productAuthState.status !== "signed_in") {
    return productAuthState;
  }

  if (Number(productAuthState.tokens?.expiresAtEpochMs) <= Date.now()) {
    productAuthState = {
      status: "auth_expired",
      displayName: "Auth expired",
      message: "Product login expired. Sign in again before using backend routes."
    };
  }

  return productAuthState;
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
    await browser.tabs.create({
      url: body.authorizationUrl,
      active: true
    });
  } catch (error) {
    const oauthRequest = publicGoogleOAuthRequest(body.authorizationUrl);
    googleOAuthState = accessDeniedGoogleState(
      `Google authorization tab failed: ${safeErrorMessage(error)}. client_id=${oauthRequest.clientId}; redirect_uri=${oauthRequest.redirectUri}`
    );
    throw new Error(googleOAuthState.message);
  }
  googleOAuthState = connectingGoogleState();
  return googleOAuthState;
}

async function loadConfigFromStorage() {
  const stored = await browser.storage.local.get(CONFIG_STORAGE_KEY);
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
  return config.supportingWebOrigin ?? config.googleOAuthRedirectTarget ?? config.cognitoRedirectUri;
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

function accessDeniedGoogleState(message = "Google authorization was denied or this user is not allowed.") {
  return {
    status: "access_denied",
    displayName: "Google access denied",
    message,
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

function publicGoogleOAuthRequest(authorizationUrl) {
  try {
    const url = new URL(authorizationUrl);
    return {
      clientId: url.searchParams.get("client_id") ?? "unavailable",
      redirectUri: url.searchParams.get("redirect_uri") ?? "unavailable"
    };
  } catch {
    return {
      clientId: "unavailable",
      redirectUri: "unavailable"
    };
  }
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
