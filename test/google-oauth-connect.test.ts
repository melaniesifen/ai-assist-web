import { describe, expect, it } from "vitest";
import {
  GOOGLE_OAUTH_STATUSES,
  accessDeniedState,
  authExpiredState,
  createGoogleOAuthStartRequest,
  getGoogleConnectButtonState,
  mapGoogleOAuthStatusResponse,
  notConnectedState
} from "../src/google-oauth-connect";
import { PRODUCT_AUTH_STATUSES, type ProductAuthState } from "../src/product-auth";

const SIGNED_IN_AUTH: ProductAuthState = {
  status: PRODUCT_AUTH_STATUSES.SIGNED_IN,
  displayName: "Signed in",
  message: "Ready",
  tokens: {
    idToken: "id.jwt.demo",
    expiresAtEpochMs: 60_000
  }
};

describe("Google OAuth connect helpers", () => {
  it("constructs the start request with a bearer header and redirect target body", () => {
    const request = createGoogleOAuthStartRequest(
      "https://api.dev.example.test/",
      "Bearer id.jwt.demo",
      "https://extension-id.chromiumapp.org/"
    );

    expect(request.url).toBe("https://api.dev.example.test/oauth/google/start");
    expect(request.init.method).toBe("POST");
    expect((request.init.headers as Headers).get("Authorization")).toBe("Bearer id.jwt.demo");
    expect((request.init.headers as Headers).get("Content-Type")).toBe("application/json");
    expect(request.init.body).toBe(JSON.stringify({ redirectTarget: "https://extension-id.chromiumapp.org/" }));
    expect(request.url).not.toMatch(/jwt|Bearer|redirectTarget/i);
  });

  it("fails closed instead of moving bearer values into query strings", () => {
    expect(() => createGoogleOAuthStartRequest("https://api.dev.example.test", "id.jwt.demo", "https://extension.example.test/")).toThrow(
      /bearer token is required/i
    );
    expect(() => createGoogleOAuthStartRequest("https://api.dev.example.test", "Bearer id.jwt.demo", " ")).toThrow(
      /redirect target is required/i
    );
  });

  it("maps connected, reconnect, access-denied, expired, and dependency states", () => {
    expect(mapGoogleOAuthStatusResponse({ connected: true }).status).toBe(GOOGLE_OAUTH_STATUSES.CONNECTED);
    expect(mapGoogleOAuthStatusResponse({ connected: false, accounts: [{ reconnectRequired: true }] }).status).toBe(
      GOOGLE_OAUTH_STATUSES.RECONNECT_REQUIRED
    );
    expect(mapGoogleOAuthStatusResponse({ error: { code: "AUTHORIZATION_DENIED" } })).toEqual(accessDeniedState());
    expect(mapGoogleOAuthStatusResponse({ error: { code: "AUTHENTICATION_EXPIRED" } })).toEqual(authExpiredState());
    expect(mapGoogleOAuthStatusResponse({ error: { code: "DEPENDENCY_UNAVAILABLE" } }).status).toBe(
      GOOGLE_OAUTH_STATUSES.DEPENDENCY_ERROR
    );
  });

  it("keeps connect button visible only after product sign-in and disables while connecting", () => {
    const signedOut: ProductAuthState = {
      status: PRODUCT_AUTH_STATUSES.SIGNED_OUT,
      displayName: "Signed out",
      message: "Sign in"
    };
    expect(getGoogleConnectButtonState(signedOut, notConnectedState()).visible).toBe(false);

    const ready = getGoogleConnectButtonState(SIGNED_IN_AUTH, notConnectedState(false));
    expect(ready).toMatchObject({
      visible: true,
      disabled: false,
      label: "Connect Google"
    });

    const connecting = getGoogleConnectButtonState(SIGNED_IN_AUTH, {
      status: GOOGLE_OAUTH_STATUSES.CONNECTING,
      displayName: "Connecting",
      message: "Google authorization is open.",
      connected: false
    });
    expect(connecting).toMatchObject({
      visible: true,
      disabled: true
    });
  });
});
