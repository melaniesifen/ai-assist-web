import { describe, expect, it } from "vitest";
import { createDogfoodSidebarState, type DogfoodSidebarContractInput } from "../src/dogfood-sidebar-state";
import {
  createDogfoodCommandBody,
  materializeCommandPath,
  safeDogfoodCommandLogExcludesForbiddenContent,
  submitDogfoodCommand,
  type DogfoodCommandFetcher
} from "../src/dogfood-command-client";

const READY_INPUT: DogfoodSidebarContractInput = {
  productAuth: "signed_in",
  googleOAuth: "connected",
  activeDocument: {
    status: "detected",
    documentId: "doc_ready_123"
  },
  context: "ready",
  provider: "ready",
  command: "ready",
  stream: "open",
  proposedActions: "none",
  apply: "blocked",
  controlledDocumentWriteApproved: false
};

describe("dogfood command client", () => {
  it("submits a deployed-shaped command with extension-owned product auth", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: DogfoodCommandFetcher = async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(202, {
        data: {
          commandId: "cmd_backend_001",
          requestId: "req_001",
          correlationId: "corr_001",
          status: "accepted"
        }
      });
    };

    const result = await submitDogfoodCommand(
      {
        prompt: "Summarize the private roadmap.",
        commandKind: "summarize",
        httpBaseUrl: "https://api.dev.example.test/",
        sessionId: "session 123",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher,
        idProvider: () => "cmd_frontend_001"
      }
    );

    expect(result.status).toBe("accepted");
    expect(result.commandId).toBe("cmd_backend_001");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.dev.example.test/resource-sessions/session%20123/commands");
    expect(calls[0].url).not.toContain("Summarize");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer id.jwt.demo");
    expect(new Headers(calls[0].init?.headers).get("Idempotency-Key")).toBe("cmd_frontend_001");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      commandId: "cmd_frontend_001",
      commandType: "assistant.command.create",
      provider: "openai",
      resourceId: "doc_ready_123",
      contextMode: "ACTIVE_RESOURCE",
      prompt: "Summarize the private roadmap.",
      command: {
        kind: "ASK_ASSISTANT",
        commandKind: "summarize",
        resourceRef: {
          connector: "google_docs",
          resourceId: "doc_ready_123",
          resourceType: "document"
        }
      }
    });
  });

  it("blocks before auth or fetch when product auth is not ready", async () => {
    let fetchCalled = false;
    let authCalled = false;

    const result = await submitDogfoodCommand(
      {
        prompt: "Summarize this doc",
        commandKind: "summarize",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState({ ...READY_INPUT, productAuth: "signed_out" })
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
      errorCode: "PRODUCT_AUTH_REQUIRED",
      retryable: true
    });
    expect(authCalled).toBe(false);
    expect(fetchCalled).toBe(false);
  });

  it("blocks before fetch when Google OAuth is not connected", async () => {
    const result = await submitDogfoodCommand(
      {
        prompt: "Summarize this doc",
        commandKind: "summarize",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState({ ...READY_INPUT, googleOAuth: "not_connected" })
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher: async () => {
          throw new Error("fetch should not be called");
        }
      }
    );

    expect(result.status).toBe("blocked");
    expect(result.errorCode).toBe("GOOGLE_OAUTH_REQUIRED");
  });

  it("renders provider readiness blockers as dependency errors without calling the backend", async () => {
    const result = await submitDogfoodCommand(
      {
        prompt: "Suggest edits",
        commandKind: "suggest_edits",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState({ ...READY_INPUT, provider: "missing" })
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher: async () => {
          throw new Error("fetch should not be called");
        }
      }
    );

    expect(result).toMatchObject({
      status: "dependency_error",
      errorCode: "PROVIDER_REQUIRED",
      retryable: true
    });
  });

  it.each([
    [
      "dependency-error",
      501,
      { error: { code: "ORCHESTRATION_DEPENDENCIES_NOT_CONFIGURED", category: "DEPENDENCY", retryable: false } },
      "dependency_error"
    ],
    ["retryable", 429, { error: { code: "RATE_LIMITED", category: "THROTTLE", retryable: true } }, "retryable_error"]
  ] as const)("normalizes backend %s responses", async (_label, status, body, expectedStatus) => {
    const result = await submitDogfoodCommand(
      {
        prompt: "Summarize this doc",
        commandKind: "summarize",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher: async () => jsonResponse(status, body)
      }
    );

    expect(result.status).toBe(expectedStatus);
    expect(result.message).not.toMatch(/Summarize this doc|Bearer|id\.jwt/i);
  });

  it("keeps command logs metadata-only even when prompt and backend body contain sensitive content", async () => {
    const result = await submitDogfoodCommand(
      {
        prompt: "private prompt with document text and sk-live-secret",
        commandKind: "custom",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher: async () =>
          jsonResponse(503, {
            error: {
              code: "PROVIDER_UNAVAILABLE",
              category: "DEPENDENCY",
              retryable: true,
              message: "provider unavailable"
            }
          })
      }
    );

    expect(safeDogfoodCommandLogExcludesForbiddenContent(result.safeLogEvent)).toBe(true);
    expect(JSON.stringify(result.safeLogEvent)).not.toMatch(/private prompt|document text|sk-live|doc_ready_123|Bearer|provider unavailable/i);
  });

  it("normalizes rejected fetches into safe retryable command results", async () => {
    const result = await submitDogfoodCommand(
      {
        prompt: "private prompt with document text",
        commandKind: "custom",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      {
        authProvider: async () => "Bearer id.jwt.demo",
        fetcher: async () => {
          throw new Error("CORS failure with private prompt and doc_ready_123");
        },
        idProvider: () => "cmd_transport_001"
      }
    );

    expect(result).toMatchObject({
      status: "retryable_error",
      retryable: true,
      commandId: "cmd_transport_001",
      errorCode: "BACKEND_UNAVAILABLE"
    });
    expect(result.message).not.toMatch(/CORS failure|private prompt|doc_ready_123|Bearer/i);
    expect(safeDogfoodCommandLogExcludesForbiddenContent(result.safeLogEvent)).toBe(true);
    expect(JSON.stringify(result.safeLogEvent)).not.toMatch(/private prompt|document text|doc_ready_123|Bearer|CORS/i);
  });

  it("generates distinct idempotency keys for rapid commands without leaking sensitive content", async () => {
    const observedKeys: string[] = [];
    const fetcher: DogfoodCommandFetcher = async (_url, init) => {
      observedKeys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return jsonResponse(202, { data: { status: "accepted", commandId: observedKeys.at(-1) } });
    };
    const baseRequest = {
      prompt: "Summarize private material",
      commandKind: "summarize" as const,
      httpBaseUrl: "https://api.dev.example.test",
      sessionId: "session_001",
      activeDocumentId: "doc_ready_123",
      sidebarState: createDogfoodSidebarState(READY_INPUT)
    };
    let idIndex = 0;
    const randomIdProvider = () => ["uuid one", "uuid two"][idIndex++] ?? "uuid fallback";

    await submitDogfoodCommand(baseRequest, {
      authProvider: async () => "Bearer id.jwt.demo",
      fetcher,
      randomIdProvider
    });
    await submitDogfoodCommand(baseRequest, {
      authProvider: async () => "Bearer id.jwt.demo",
      fetcher,
      randomIdProvider
    });

    expect(observedKeys).toEqual(["cmd_uuid_one", "cmd_uuid_two"]);
    expect(JSON.stringify(observedKeys)).not.toMatch(/Summarize|private|doc_ready_123|Bearer/i);
  });

  it("materializes route and body context without putting active document context in URLs", () => {
    expect(materializeCommandPath("/resource-sessions/{sessionId}/commands", "session/id")).toBe(
      "/resource-sessions/session%2Fid/commands"
    );
    const body = createDogfoodCommandBody(
      {
        prompt: "Suggest edits",
        commandKind: "suggest_edits",
        httpBaseUrl: "https://api.dev.example.test",
        sessionId: "session_001",
        activeDocumentId: "doc_ready_123",
        sidebarState: createDogfoodSidebarState(READY_INPUT)
      },
      "Suggest edits",
      "cmd_001"
    );

    expect(JSON.stringify(body)).toContain("doc_ready_123");
    expect(materializeCommandPath("/resource-sessions/{sessionId}/commands", "session_001")).not.toContain("doc_ready_123");
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
