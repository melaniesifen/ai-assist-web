import { PRODUCT_AUTH_STATUSES, type ProductAuthState } from "./product-auth";

export const GOOGLE_OAUTH_STATUSES = Object.freeze({
  NOT_CONNECTED: "not_connected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECT_REQUIRED: "reconnect_required",
  ACCESS_DENIED: "access_denied",
  AUTH_EXPIRED: "auth_expired",
  DEPENDENCY_ERROR: "dependency_error"
} as const);

export type GoogleOAuthStatus = (typeof GOOGLE_OAUTH_STATUSES)[keyof typeof GOOGLE_OAUTH_STATUSES];

export interface GoogleOAuthState {
  readonly status: GoogleOAuthStatus;
  readonly displayName: string;
  readonly message: string;
  readonly connected: boolean;
  readonly disabled?: boolean;
  readonly errorCode?: string;
}

export interface GoogleOAuthStatusResponse {
  readonly connected?: boolean;
  readonly accounts?: readonly {
    readonly status?: string;
    readonly reconnectRequired?: boolean;
  }[];
  readonly error?: {
    readonly code?: string;
    readonly category?: string;
  };
}

export interface GoogleOAuthConnectButtonState {
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly statusText: string;
}

const AUTHORIZATION_HEADER = "Authorization";
const GOOGLE_START_PATH = "/oauth/google/start";

export function createGoogleOAuthStartRequest(
  apiBaseUrl: string,
  authorization: string,
  redirectTarget: string
): { readonly url: string; readonly init: RequestInit } {
  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Product auth bearer token is required before starting Google OAuth.");
  }
  if (!redirectTarget.trim()) {
    throw new Error("Google OAuth redirect target is required.");
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set(AUTHORIZATION_HEADER, authorization);

  return {
    url: joinUrl(apiBaseUrl, GOOGLE_START_PATH),
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({ redirectTarget })
    }
  };
}

export function mapGoogleOAuthStatusResponse(response: GoogleOAuthStatusResponse): GoogleOAuthState {
  if (response.error?.code === "AUTHENTICATION_REQUIRED" || response.error?.code === "AUTHENTICATION_EXPIRED") {
    return authExpiredState();
  }
  if (response.error?.code === "AUTHORIZATION_DENIED") {
    return accessDeniedState();
  }
  if (response.error) {
    return dependencyErrorState();
  }
  if (response.connected) {
    return {
      status: GOOGLE_OAUTH_STATUSES.CONNECTED,
      displayName: "Google connected",
      message: "Google connection is active for this signed-in product user.",
      connected: true
    };
  }
  if (response.accounts?.some((account) => account.reconnectRequired || account.status === "reconnect_required" || account.status === "revoked")) {
    return reconnectRequiredState();
  }
  return notConnectedState(false);
}

export function getGoogleConnectButtonState(
  productAuth: ProductAuthState,
  googleOAuth: GoogleOAuthState
): GoogleOAuthConnectButtonState {
  const productSignedIn = productAuth.status === PRODUCT_AUTH_STATUSES.SIGNED_IN;
  const disabled = !productSignedIn || googleOAuth.status === GOOGLE_OAUTH_STATUSES.CONNECTING;
  const label = googleOAuth.status === GOOGLE_OAUTH_STATUSES.RECONNECT_REQUIRED ? "Reconnect Google" : "Connect Google";

  return {
    visible: productSignedIn,
    disabled,
    label,
    statusText: googleOAuth.message
  };
}

export function notConnectedState(disabled = true): GoogleOAuthState {
  return {
    status: GOOGLE_OAUTH_STATUSES.NOT_CONNECTED,
    displayName: "Google not connected",
    message: disabled ? "Sign in to the product before connecting Google." : "Connect Google before reading the active document.",
    connected: false,
    disabled
  };
}

export function connectingState(): GoogleOAuthState {
  return {
    status: GOOGLE_OAUTH_STATUSES.CONNECTING,
    displayName: "Connecting Google",
    message: "Google authorization is open.",
    connected: false
  };
}

export function reconnectRequiredState(): GoogleOAuthState {
  return {
    status: GOOGLE_OAUTH_STATUSES.RECONNECT_REQUIRED,
    displayName: "Reconnect Google",
    message: "Reconnect Google before using this document.",
    connected: false
  };
}

export function accessDeniedState(): GoogleOAuthState {
  return {
    status: GOOGLE_OAUTH_STATUSES.ACCESS_DENIED,
    displayName: "Google access denied",
    message: "Google authorization was denied or this user is not allowed.",
    connected: false,
    errorCode: "access_denied"
  };
}

export function authExpiredState(): GoogleOAuthState {
  return {
    status: GOOGLE_OAUTH_STATUSES.AUTH_EXPIRED,
    displayName: "Product auth expired",
    message: "Sign in again before connecting Google.",
    connected: false,
    errorCode: "auth_expired"
  };
}

export function dependencyErrorState(): GoogleOAuthState {
  return {
    status: GOOGLE_OAUTH_STATUSES.DEPENDENCY_ERROR,
    displayName: "Google status unavailable",
    message: "A connected service is unavailable. Retry later.",
    connected: false,
    errorCode: "dependency_unavailable"
  };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
