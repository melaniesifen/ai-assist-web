import { describe, expect, it } from "vitest";
import {
  PRODUCT_AUTH_STATUSES,
  createExtensionBearerAuthenticatedRequest,
  createBearerAuthenticatedRequest,
  createCognitoHostedUiUrl,
  createCognitoLogoutUrl,
  EXTENSION_AUTHORIZATION_HEADER_MESSAGE_TYPE,
  getProductAuthUserMessage,
  parseCognitoRedirectUrl,
  requestExtensionAuthorizationHeader,
  resolveProductAuthState,
  type ProductAuthConfig
} from "../src/product-auth";

const CONFIG: ProductAuthConfig = {
  cognitoAuthBaseUrl: "https://ai-assist-dev.auth.us-west-2.amazoncognito.com",
  cognitoClientId: "client-dev",
  cognitoRedirectUri: "https://extension.example.test/callback",
  cognitoLogoutRedirectUri: "https://extension.example.test/logout",
  cognitoScopes: ["openid", "email", "profile"],
  responseType: "token"
};

describe("product auth Hosted UI helpers", () => {
  it("builds Cognito Hosted UI and logout URLs from non-secret config", () => {
    const signInUrl = new URL(createCognitoHostedUiUrl(CONFIG, "state-demo"));
    expect(signInUrl.origin).toBe("https://ai-assist-dev.auth.us-west-2.amazoncognito.com");
    expect(signInUrl.pathname).toBe("/oauth2/authorize");
    expect(signInUrl.searchParams.get("client_id")).toBe("client-dev");
    expect(signInUrl.searchParams.get("redirect_uri")).toBe("https://extension.example.test/callback");
    expect(signInUrl.searchParams.get("response_type")).toBe("token");
    expect(signInUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(signInUrl.searchParams.get("state")).toBe("state-demo");

    const logoutUrl = new URL(createCognitoLogoutUrl(CONFIG));
    expect(logoutUrl.pathname).toBe("/logout");
    expect(logoutUrl.searchParams.get("logout_uri")).toBe("https://extension.example.test/logout");
  });

  it("parses returned browser tokens into signed-in state without exposing them in the public message", () => {
    const state = parseCognitoRedirectUrl(
      "https://extension.example.test/callback#id_token=id.jwt.demo&access_token=access.jwt.demo&expires_in=60&state=state-demo",
      "state-demo",
      1_000
    );

    expect(state.status).toBe(PRODUCT_AUTH_STATUSES.SIGNED_IN);
    expect(state.tokens).toMatchObject({
      idToken: "id.jwt.demo",
      accessToken: "access.jwt.demo",
      expiresAtEpochMs: 61_000
    });
    expect(JSON.stringify({ displayName: state.displayName, message: state.message })).not.toMatch(/id\.jwt|access\.jwt/i);
  });

  it("maps Cognito access denial and expired states distinctly", () => {
    const denied = parseCognitoRedirectUrl(
      "https://extension.example.test/callback#error=access_denied&error_description=User%20blocked&state=state-demo",
      "state-demo"
    );
    expect(denied.status).toBe(PRODUCT_AUTH_STATUSES.ACCESS_DENIED);
    expect(denied.message).toBe("User blocked");

    const expired = resolveProductAuthState({ idToken: "id.jwt.demo", expiresAtEpochMs: 1_000 }, 1_001);
    expect(expired.status).toBe(PRODUCT_AUTH_STATUSES.AUTH_EXPIRED);
  });

  it("rejects missing or mismatched Hosted UI state before accepting returned tokens", () => {
    const missing = parseCognitoRedirectUrl("https://extension.example.test/callback#id_token=id.jwt.demo", "state-demo");
    expect(missing).toMatchObject({
      status: PRODUCT_AUTH_STATUSES.ACCESS_DENIED,
      errorCode: "state_mismatch"
    });
    expect(JSON.stringify(missing)).not.toMatch(/id\.jwt/i);

    const mismatched = parseCognitoRedirectUrl(
      "https://extension.example.test/callback#id_token=id.jwt.demo&state=other-state",
      "state-demo"
    );
    expect(mismatched).toMatchObject({
      status: PRODUCT_AUTH_STATUSES.ACCESS_DENIED,
      errorCode: "state_mismatch"
    });
    expect(JSON.stringify(mismatched)).not.toMatch(/id\.jwt/i);
  });

  it("requires an ID token for the current product-route bearer contract", () => {
    const accessTokenOnly = parseCognitoRedirectUrl(
      "https://extension.example.test/callback#access_token=access.jwt.demo&expires_in=60&state=state-demo",
      "state-demo"
    );

    expect(accessTokenOnly).toMatchObject({
      status: PRODUCT_AUTH_STATUSES.SIGNED_OUT,
      errorCode: "id_token_required"
    });
  });

  it("creates bearer-authenticated product route requests only for signed-in state", () => {
    const request = createBearerAuthenticatedRequest({
      authState: {
        status: PRODUCT_AUTH_STATUSES.SIGNED_IN,
        displayName: "Signed in",
        message: "Ready",
        tokens: { idToken: "id.jwt.demo", expiresAtEpochMs: 10_000 }
      },
      method: "POST",
      headers: { "x-request-id": "request-demo" }
    });

    const headers = request.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer id.jwt.demo");
    expect(headers.get("x-request-id")).toBe("request-demo");

    expect(() =>
      createBearerAuthenticatedRequest({
        authState: resolveProductAuthState(null),
        method: "GET"
      })
    ).toThrow(/bearer token is required/i);
  });

  it("requests product-route bearer headers from the extension background boundary just in time", async () => {
    const sentMessages: unknown[] = [];
    const runtime = {
      async sendMessage(message: unknown) {
        sentMessages.push(message);
        return { ok: true, authorization: "Bearer id.jwt.demo" };
      }
    };

    await expect(requestExtensionAuthorizationHeader(runtime)).resolves.toBe("Bearer id.jwt.demo");
    expect(sentMessages).toEqual([{ type: EXTENSION_AUTHORIZATION_HEADER_MESSAGE_TYPE }]);

    const request = await createExtensionBearerAuthenticatedRequest(runtime, {
      method: "POST",
      headers: { "x-request-id": "request-demo" }
    });
    const headers = request.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer id.jwt.demo");
    expect(headers.get("x-request-id")).toBe("request-demo");
  });

  it("fails closed when the extension background boundary cannot provide a bearer", async () => {
    await expect(
      requestExtensionAuthorizationHeader({
        async sendMessage() {
          return { ok: true, authorization: null };
        }
      })
    ).rejects.toThrow(/bearer token is required/i);
  });

  it("keeps user messages explicit for password setup, signed-in, denied, and expired states", () => {
    expect(getProductAuthUserMessage(PRODUCT_AUTH_STATUSES.NEW_PASSWORD_REQUIRED)).toMatch(/password setup/i);
    expect(getProductAuthUserMessage(PRODUCT_AUTH_STATUSES.SIGNED_IN)).toMatch(/Google OAuth remains a separate/i);
    expect(getProductAuthUserMessage(PRODUCT_AUTH_STATUSES.ACCESS_DENIED)).toMatch(/not allowlisted/i);
    expect(getProductAuthUserMessage(PRODUCT_AUTH_STATUSES.AUTH_EXPIRED)).toMatch(/expired/i);
  });
});
