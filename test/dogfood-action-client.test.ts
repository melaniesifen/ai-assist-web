import { describe, expect, it } from "vitest";
import { createDogfoodSidebarState, type DogfoodSidebarContractInput } from "../src/dogfood-sidebar-state";
import {
  createDogfoodActionBody,
  materializeDogfoodActionPath,
  safeDogfoodActionLogExcludesForbiddenContent,
  submitDogfoodActionRoute
} from "../src/dogfood-action-client";
import { type DogfoodCommandFetcher } from "../src/dogfood-command-client";

const READY_INPUT: DogfoodSidebarContractInput = {
  productAuth: "signed_in",
  googleOAuth: "connected",
  activeDocument: {
    status: "detected",
    documentId: "doc_ready_123"
  },
  context: "ready",
  provider: "ready",
  command: "accepted",
  stream: "open",
  proposedActions: "ready",
  apply: "ready",
  controlledDocumentWriteApproved: true
};

describe("dogfood action client", () => {
  it("submits backend-shaped approve and reject routes with extension-owned product auth", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: DogfoodCommandFetcher = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(202, {
        data: {
          requestId: "req_action_001",
          correlationId: "corr_action_001",
          status: "accepted"
        }
      });
    };

    const approve = await submitDogfoodActionRoute(
      {
        kind: "approve",
        httpBaseUrl: "https://api.dev.example.test/",
        sessionId: "session 123",
        actionId: "action/one",
        actionStatus: "PROPOSED",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher
      }
    );
    const reject = await submitDogfoodActionRoute(
      {
        kind: "reject",
        httpBaseUrl: "https://api.dev.example.test/",
        sessionId: "session 123",
        actionId: "action/two",
        actionStatus: "APPROVED",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher
      }
    );

    expect(approve.status).toBe("accepted");
    expect(reject.status).toBe("accepted");
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.dev.example.test/resource-sessions/session%20123/actions/action%2Fone/approve",
      "https://api.dev.example.test/resource-sessions/session%20123/actions/action%2Ftwo/reject"
    ]);
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer id.jwt.demo");
    expect(new Headers(calls[0].init?.headers).get("Idempotency-Key")).toBeNull();
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      actionId: "action/one",
      decision: "approve",
      reasonCode: "USER_APPROVED"
    });
  });

  it("sends apply through the backend apply route with an idempotency key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await submitDogfoodActionRoute(
      {
        kind: "apply",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        actionId: "action_apply_001",
        actionStatus: "APPROVED",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        idProvider: () => "apply_frontend_001",
        fetcher: async (url, init) => {
          calls.push({ url: String(url), init });
          return jsonResponse(202, { data: { requestId: "req_apply_001" } });
        }
      }
    );

    expect(result.status).toBe("accepted");
    expect(calls[0].url).toBe("https://api.dev.example.test/resource-sessions/session_001/apply-action");
    expect(new Headers(calls[0].init?.headers).get("Idempotency-Key")).toBe("apply_frontend_001");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ actionId: "action_apply_001" });
  });

  it("blocks apply before auth or fetch when controlled-document approval is missing", async () => {
    let authCalled = false;
    let fetchCalled = false;
    const result = await submitDogfoodActionRoute(
      {
        kind: "apply",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        actionId: "action_apply_001",
        actionStatus: "APPROVED",
        sidebarState: createDogfoodSidebarState({
          ...READY_INPUT,
          controlledDocumentWriteApproved: false
        })
      },
      {
        authProvider: async () => {
          authCalled = true;
          return "Bearer should-not-be-used";
        },
        fetcher: async () => {
          fetchCalled = true;
          return jsonResponse(202, {});
        }
      }
    );

    expect(result).toMatchObject({
      status: "blocked",
      errorCode: "APPLY_WRITE_APPROVAL_REQUIRED"
    });
    expect(authCalled).toBe(false);
    expect(fetchCalled).toBe(false);
  });

  it("blocks apply when stream refresh is required", async () => {
    const result = await submitDogfoodActionRoute(
      {
        kind: "apply",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        actionId: "action_apply_001",
        actionStatus: "APPROVED",
        sidebarState: createDogfoodSidebarState({
          ...READY_INPUT,
          stream: "reconnect_required"
        })
      },
      {
        authProvider: async () => "Bearer should-not-be-used",
        fetcher: async () => {
          throw new Error("fetch should not be called");
        }
      }
    );

    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("STREAM_REFRESH_REQUIRED");
    expect(result.message).not.toMatch(/Bearer|action payload|document text/i);
  });

  it("blocks action routes before auth or fetch when backend session identity is missing", async () => {
    let authCalled = false;
    let fetchCalled = false;
    const result = await submitDogfoodActionRoute(
      {
        kind: "approve",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "",
        actionId: "action_missing_session",
        actionStatus: "PROPOSED",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => {
          authCalled = true;
          return "Bearer should-not-be-used";
        },
        fetcher: async () => {
          fetchCalled = true;
          return jsonResponse(202, {});
        }
      }
    );

    expect(result).toMatchObject({
      status: "blocked",
      errorCode: "ACTION_SESSION_REQUIRED"
    });
    expect(authCalled).toBe(false);
    expect(fetchCalled).toBe(false);
  });

  it("keeps action logs metadata-only even when backend errors mention sensitive bodies", async () => {
    const result = await submitDogfoodActionRoute(
      {
        kind: "apply",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        actionId: "action_apply_001",
        actionStatus: "APPROVED",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        idProvider: () => "apply_frontend_001",
        fetcher: async () =>
          jsonResponse(503, {
            error: {
              category: "DEPENDENCY",
              code: "CONNECTOR_UNAVAILABLE",
              retryable: true,
              message: "replacement document text and decrypted action payload unavailable"
            }
          })
      }
    );

    expect(result.status).toBe("dependency_error");
    expect(safeDogfoodActionLogExcludesForbiddenContent(result.safeLogEvent)).toBe(true);
    expect(JSON.stringify(result.safeLogEvent)).not.toMatch(/replacement document text|decrypted|payload|Bearer|id\.jwt/i);
  });

  it("materializes routes and minimal bodies without tenant or user identity", () => {
    const request = {
      kind: "approve" as const,
      httpBaseUrl: "https://api.dev.example.test",
      sessionId: "session/id",
      actionId: "action/id",
      actionStatus: "PROPOSED",
      sidebarState: createDogfoodSidebarState(READY_INPUT)
    };

    expect(materializeDogfoodActionPath("/resource-sessions/{sessionId}/actions/{actionId}/{decision}", request)).toBe(
      "/resource-sessions/session%2Fid/actions/action%2Fid/approve"
    );
    expect(createDogfoodActionBody(request)).toEqual({
      actionId: "action/id",
      decision: "approve",
      reasonCode: "USER_APPROVED"
    });
    expect(Object.keys(createDogfoodActionBody(request))).not.toContain("tenantId");
    expect(Object.keys(createDogfoodActionBody(request))).not.toContain("userId");
    expect(JSON.stringify(createDogfoodActionBody(request))).not.toMatch(/document text|selected text/i);
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
