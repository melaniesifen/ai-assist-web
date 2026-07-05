import { describe, expect, it } from "vitest";
import {
  ensureDogfoodContextConsent,
  materializeContextConsentPath,
  safeDogfoodContextConsentLogExcludesForbiddenContent,
  type DogfoodContextConsentFetcher
} from "../src/dogfood-context-consent-client";

describe("dogfood context consent client", () => {
  it("creates active-resource consent with extension-owned product auth and active document metadata", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: DogfoodContextConsentFetcher = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(201, {
        consentGrant: {
          grantId: "grant_backend_001",
          tenantId: "tenant-1",
          userId: "user-1",
          provider: "google_docs",
          contextMode: "ACTIVE_RESOURCE",
          resourceRef: { provider: "google_docs", resourceId: "doc_ready_123" },
          scopes: ["docs.read"],
          status: "active",
          grantedAt: "2026-07-04T12:00:00.000Z",
          revokedAt: null,
          expiresAt: "2026-07-04T20:00:00.000Z"
        }
      });
    };

    const result = await ensureDogfoodContextConsent(
      {
        httpBaseUrl: "https://api.dev.example.test/",
        sessionId: "session 123",
        activeDocumentId: "doc_ready_123"
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher
      }
    );

    expect(result.status).toBe("granted");
    expect(result.grantId).toBe("grant_backend_001");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.dev.example.test/resource-sessions/session%20123/context-consent");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer id.jwt.demo");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ resourceId: "doc_ready_123" });
    expect(JSON.stringify(calls[0].init?.body)).not.toMatch(/tenant-1|user-1|id\.jwt/i);
  });

  it("maps missing Google OAuth to a blocked metadata-only result", async () => {
    const result = await ensureDogfoodContextConsent(
      {
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123"
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher: async () =>
          jsonResponse(403, {
            error: {
              code: "GOOGLE_OAUTH_REQUIRED",
              category: "AUTHORIZATION",
              retryable: true,
              message: "Connect Google before granting document context."
            }
          })
      }
    );

    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("GOOGLE_OAUTH_REQUIRED");
    expect(result.message).not.toMatch(/doc_ready_123|Bearer|id\.jwt/i);
    expect(safeDogfoodContextConsentLogExcludesForbiddenContent(result.safeLogEvent)).toBe(true);
  });

  it("blocks before auth or fetch when active document metadata is missing", async () => {
    let authCalled = false;
    let fetchCalled = false;

    const result = await ensureDogfoodContextConsent(
      {
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: null
      },
      {
        authProvider: async () => {
          authCalled = true;
          return "Bearer should-not-be-used";
        },
        fetcher: async () => {
          fetchCalled = true;
          return jsonResponse(201, {});
        }
      }
    );

    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("ACTIVE_DOCUMENT_REQUIRED");
    expect(authCalled).toBe(false);
    expect(fetchCalled).toBe(false);
  });

  it("keeps consent logs metadata-only for backend errors", async () => {
    const result = await ensureDogfoodContextConsent(
      {
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123"
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher: async () =>
          jsonResponse(503, {
            error: {
              code: "CONTEXT_CONSENT_DEPENDENCY_UNAVAILABLE",
              message: "raw document text and Bearer value must not leak"
            }
          })
      }
    );

    expect(result.status).toBe("dependency_error");
    expect(safeDogfoodContextConsentLogExcludesForbiddenContent(result.safeLogEvent)).toBe(true);
    expect(JSON.stringify(result.safeLogEvent)).not.toMatch(/doc_ready_123|raw document text|Bearer|id\.jwt/i);
  });

  it("materializes context-consent route without active document IDs in the URL", () => {
    expect(materializeContextConsentPath("/resource-sessions/{sessionId}/context-consent", "session/id")).toBe(
      "/resource-sessions/session%2Fid/context-consent"
    );
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
