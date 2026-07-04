export const PRODUCT_AUTH_STATUSES = Object.freeze({
  SIGNED_OUT: "signed_out",
  SIGNING_IN: "signing_in",
  NEW_PASSWORD_REQUIRED: "new_password_required",
  ACCESS_DENIED: "access_denied",
  SIGNED_IN: "signed_in",
  AUTH_EXPIRED: "auth_expired",
  CONFIG_REQUIRED: "config_required"
} as const);

export type ProductAuthStatus = (typeof PRODUCT_AUTH_STATUSES)[keyof typeof PRODUCT_AUTH_STATUSES];

export interface ProductAuthTokenSet {
  readonly idToken?: string;
  readonly accessToken?: string;
  readonly expiresAtEpochMs: number;
}

export interface ProductAuthState {
  readonly status: ProductAuthStatus;
  readonly displayName: string;
  readonly message: string;
  readonly tokens?: ProductAuthTokenSet;
  readonly errorCode?: string;
}

export interface ProductAuthConfig {
  readonly cognitoAuthBaseUrl?: string;
  readonly cognitoClientId?: string;
  readonly cognitoRedirectUri?: string;
  readonly cognitoLogoutRedirectUri?: string;
  readonly cognitoScopes?: readonly string[];
  readonly responseType?: "token" | "code";
}

export interface AuthenticatedRequestConfig extends RequestInit {
  readonly authState: ProductAuthState;
}

export interface ExtensionRuntimeAuthBridge {
  sendMessage(message: { readonly type: typeof EXTENSION_AUTHORIZATION_HEADER_MESSAGE_TYPE }): Promise<{
    readonly ok?: boolean;
    readonly authorization?: string | null;
    readonly error?: string;
  }>;
}

export const EXTENSION_AUTHORIZATION_HEADER_MESSAGE_TYPE = "AI_ASSIST_GET_AUTHORIZATION_HEADER";

const DEFAULT_COGNITO_SCOPES = Object.freeze(["openid", "email", "profile"]);
const DEFAULT_RESPONSE_TYPE = "token";
const AUTHORIZATION_HEADER = "Authorization";

export function createCognitoHostedUiUrl(config: ProductAuthConfig, nonce: string): string {
  assertHostedUiConfig(config);

  const authorizeUrl = new URL("/oauth2/authorize", normalizeOrigin(config.cognitoAuthBaseUrl));
  authorizeUrl.searchParams.set("client_id", config.cognitoClientId);
  authorizeUrl.searchParams.set("redirect_uri", config.cognitoRedirectUri);
  authorizeUrl.searchParams.set("response_type", config.responseType ?? DEFAULT_RESPONSE_TYPE);
  authorizeUrl.searchParams.set("scope", (config.cognitoScopes?.length ? config.cognitoScopes : DEFAULT_COGNITO_SCOPES).join(" "));
  authorizeUrl.searchParams.set("state", nonce);
  return authorizeUrl.toString();
}

export function createCognitoLogoutUrl(config: ProductAuthConfig): string {
  assertHostedUiConfig(config);

  const logoutUrl = new URL("/logout", normalizeOrigin(config.cognitoAuthBaseUrl));
  logoutUrl.searchParams.set("client_id", config.cognitoClientId);
  logoutUrl.searchParams.set("logout_uri", config.cognitoLogoutRedirectUri ?? config.cognitoRedirectUri);
  return logoutUrl.toString();
}

export function parseCognitoRedirectUrl(redirectUrl: string, expectedState: string, nowEpochMs = Date.now()): ProductAuthState {
  const parsed = new URL(redirectUrl);
  const params = new URLSearchParams(parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.search);

  if (!expectedState || params.get("state") !== expectedState) {
    return {
      status: PRODUCT_AUTH_STATUSES.ACCESS_DENIED,
      displayName: "Access denied",
      message: "Cognito sign-in response did not match this browser sign-in attempt.",
      errorCode: "state_mismatch"
    };
  }

  const error = params.get("error");
  if (error) {
    return {
      status: error === "access_denied" ? PRODUCT_AUTH_STATUSES.ACCESS_DENIED : PRODUCT_AUTH_STATUSES.SIGNED_OUT,
      displayName: error === "access_denied" ? "Access denied" : "Signed out",
      message: params.get("error_description") ?? "Cognito did not complete sign-in.",
      errorCode: error
    };
  }

  const idToken = params.get("id_token") ?? undefined;
  const accessToken = params.get("access_token") ?? undefined;
  const expiresInSeconds = Number(params.get("expires_in") ?? "3600");

  if (!idToken) {
    return {
      status: PRODUCT_AUTH_STATUSES.SIGNED_OUT,
      displayName: "Signed out",
      message: "Cognito sign-in did not return a usable product identity token.",
      errorCode: "id_token_required"
    };
  }

  return {
    status: PRODUCT_AUTH_STATUSES.SIGNED_IN,
    displayName: "Signed in",
    message: "Product login is active for this browser sidebar.",
    tokens: {
      idToken,
      accessToken,
      expiresAtEpochMs: nowEpochMs + Math.max(0, expiresInSeconds) * 1000
    }
  };
}

export function resolveProductAuthState(tokens: ProductAuthTokenSet | null | undefined, nowEpochMs = Date.now()): ProductAuthState {
  if (!tokens?.idToken && !tokens?.accessToken) {
    return {
      status: PRODUCT_AUTH_STATUSES.SIGNED_OUT,
      displayName: "Signed out",
      message: "Sign in with the invited Cognito user before connecting Google."
    };
  }

  if (tokens.expiresAtEpochMs <= nowEpochMs) {
    return {
      status: PRODUCT_AUTH_STATUSES.AUTH_EXPIRED,
      displayName: "Auth expired",
      message: "Product login expired. Sign in again before using backend routes."
    };
  }

  return {
    status: PRODUCT_AUTH_STATUSES.SIGNED_IN,
    displayName: "Signed in",
    message: "Product login is active for this browser sidebar.",
    tokens
  };
}

export function createBearerAuthenticatedRequest(input: AuthenticatedRequestConfig): RequestInit {
  if (input.authState.status !== PRODUCT_AUTH_STATUSES.SIGNED_IN || !input.authState.tokens?.idToken) {
    throw new Error("Product auth bearer token is required before calling authenticated product routes.");
  }

  const headers = new Headers(input.headers);
  headers.set(AUTHORIZATION_HEADER, `Bearer ${input.authState.tokens.idToken}`);

  const { authState: _authState, ...request } = input;
  return {
    ...request,
    headers
  };
}

export async function requestExtensionAuthorizationHeader(runtime: ExtensionRuntimeAuthBridge): Promise<string> {
  const response = await runtime.sendMessage({ type: EXTENSION_AUTHORIZATION_HEADER_MESSAGE_TYPE });

  if (!response?.ok || !response.authorization?.startsWith("Bearer ")) {
    throw new Error(response?.error ?? "Product auth bearer token is required before calling authenticated product routes.");
  }

  return response.authorization;
}

export async function createExtensionBearerAuthenticatedRequest(
  runtime: ExtensionRuntimeAuthBridge,
  request: RequestInit = {}
): Promise<RequestInit> {
  const authorization = await requestExtensionAuthorizationHeader(runtime);
  const headers = new Headers(request.headers);
  headers.set(AUTHORIZATION_HEADER, authorization);

  return {
    ...request,
    headers
  };
}

export function getProductAuthUserMessage(status: ProductAuthStatus): string {
  switch (status) {
    case PRODUCT_AUTH_STATUSES.SIGNING_IN:
      return "Cognito sign-in is open.";
    case PRODUCT_AUTH_STATUSES.NEW_PASSWORD_REQUIRED:
      return "Complete the required password setup in the Cognito sign-in window.";
    case PRODUCT_AUTH_STATUSES.ACCESS_DENIED:
      return "This Cognito user is not allowlisted for AI Assist dev.";
    case PRODUCT_AUTH_STATUSES.SIGNED_IN:
      return "Product login is active. Google OAuth remains a separate next step.";
    case PRODUCT_AUTH_STATUSES.AUTH_EXPIRED:
      return "Product login expired. Sign in again.";
    case PRODUCT_AUTH_STATUSES.CONFIG_REQUIRED:
      return "Cognito Hosted UI configuration is required for sidebar login.";
    case PRODUCT_AUTH_STATUSES.SIGNED_OUT:
    default:
      return "Sign in with Cognito before connecting Google.";
  }
}

function assertHostedUiConfig(config: ProductAuthConfig): asserts config is Required<Pick<ProductAuthConfig, "cognitoAuthBaseUrl" | "cognitoClientId" | "cognitoRedirectUri">> &
  ProductAuthConfig {
  if (!config.cognitoAuthBaseUrl || !config.cognitoClientId || !config.cognitoRedirectUri) {
    throw new Error("Cognito Hosted UI base URL, client ID, and redirect URI are required.");
  }
}

function normalizeOrigin(origin: string | undefined): string {
  if (!origin) {
    throw new Error("Cognito Hosted UI base URL is required.");
  }
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}
