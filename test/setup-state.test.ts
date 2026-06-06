import { describe, expect, it } from "vitest";
import {
  GOOGLE_OAUTH_CONNECTION_STATUSES,
  PRODUCT_SESSION_STATUSES,
  PROVIDER_SECRET_READINESS_STATUSES,
  RESOURCE_SESSION_READINESS_STATUSES,
  createFirstRunSetupViewModel,
  createSafeSetupLogEvent,
  createSetupDemoStates,
  createSetupStatusCoverageFixtures,
  getStatusCoverageLabels,
  safeSetupLogExcludesForbiddenContent,
  type FirstRunSetupStatus
} from "../src/setup-state";

async function loadM3ContractFixtures(): Promise<{
  firstRunSetupReadyFixture: { value: FirstRunSetupStatus };
  firstRunSetupNeedsUserActionFixture: { value: FirstRunSetupStatus };
  validateFirstRunSetupStatus: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
}> {
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const fixtures = await import("../../ai-assist-contracts/fixtures/m3-first-run-setup.fixtures.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const setup = await import("../../ai-assist-contracts/src/setup.js");

  return {
    firstRunSetupReadyFixture: fixtures.firstRunSetupReadyFixture,
    firstRunSetupNeedsUserActionFixture: fixtures.firstRunSetupNeedsUserActionFixture,
    validateFirstRunSetupStatus: setup.validateFirstRunSetupStatus
  };
}

describe("M3 first-run setup state", () => {
  it("maps real M3 contract fixtures into setup view models", async () => {
    const {
      firstRunSetupReadyFixture,
      firstRunSetupNeedsUserActionFixture,
      validateFirstRunSetupStatus
    } = await loadM3ContractFixtures();

    expect(validateFirstRunSetupStatus(firstRunSetupReadyFixture.value)).toMatchObject({ valid: true, issues: [] });
    expect(validateFirstRunSetupStatus(firstRunSetupNeedsUserActionFixture.value)).toMatchObject({
      valid: true,
      issues: []
    });

    const ready = createFirstRunSetupViewModel(firstRunSetupReadyFixture.value);
    const needsAction = createFirstRunSetupViewModel(firstRunSetupNeedsUserActionFixture.value);

    expect(ready.ready).toBe(true);
    expect(ready.contextPosture).toBe("SELECTION");
    expect(ready.productSession.status).toBe("Authenticated");
    expect(ready.googleOAuth.status).toBe("Connected");
    expect(ready.providerSecrets[0].status).toBe("Valid");
    expect(ready.resourceSession.status).toBe("Ready");
    expect(needsAction.ready).toBe(false);
    expect(needsAction.errors.map((error) => error.kind)).toEqual([
      "product_session_expired",
      "provider_secret_expired"
    ]);
  });

  it("covers required setup status families", () => {
    const statuses = createSetupStatusCoverageFixtures();
    const labels = getStatusCoverageLabels(statuses);
    const validCoverageStatus: FirstRunSetupStatus = {
      ...statuses[1],
      providerSecrets: [
        {
          provider: "OPENAI",
          status: PROVIDER_SECRET_READINESS_STATUSES.VALID,
          secretId: "secret_m3_openai",
          fingerprint: "fp_m3_openai",
          expiresAt: "2026-06-07T02:00:00.000Z"
        }
      ]
    };

    expect(statuses.map((status) => status.productSession.status)).toEqual([
      PRODUCT_SESSION_STATUSES.ANONYMOUS,
      PRODUCT_SESSION_STATUSES.AUTHENTICATED,
      PRODUCT_SESSION_STATUSES.EXPIRED
    ]);
    expect(statuses.map((status) => status.googleOAuth.status)).toEqual([
      GOOGLE_OAUTH_CONNECTION_STATUSES.NOT_CONNECTED,
      GOOGLE_OAUTH_CONNECTION_STATUSES.CONNECTED,
      GOOGLE_OAUTH_CONNECTION_STATUSES.RECONNECT_REQUIRED
    ]);
    expect(statuses.map((status) => status.resourceSession?.status)).toEqual([
      RESOURCE_SESSION_READINESS_STATUSES.NOT_STARTED,
      RESOURCE_SESSION_READINESS_STATUSES.READY,
      RESOURCE_SESSION_READINESS_STATUSES.NOT_READY
    ]);
    expect(labels).toContain("OpenAI key: Pending validation");
    expect(labels).toContain("OpenAI key: Validation failed");
    expect(createFirstRunSetupViewModel(validCoverageStatus).providerSecrets[0].status).toBe("Valid");
  });

  it("renders local M3 demo states for ready and needs-action setup", () => {
    const viewModels = createSetupDemoStates().map(createFirstRunSetupViewModel);

    expect(viewModels).toHaveLength(2);
    expect(viewModels[0].ready).toBe(true);
    expect(viewModels[0].productSession.metadata.map((item) => item.label)).toEqual([
      "Tenant",
      "User",
      "Session",
      "Expires"
    ]);
    expect(viewModels[0].googleOAuth.metadata.map((item) => item.label)).toContain("Scopes");
    expect(viewModels[0].resourceSession.metadata.map((item) => item.label)).toEqual([
      "Session",
      "Resource",
      "Revision"
    ]);
    expect(viewModels[1].ready).toBe(false);
    expect(viewModels[1].productSession.status).toBe("Expired");
    expect(viewModels[1].googleOAuth.status).toBe("Reconnect required");
    expect(viewModels[1].providerSecrets.map((provider) => provider.status)).toEqual(["Expired", "Invalid"]);
    expect(viewModels[1].resourceSession.status).toBe("Not ready");
  });

  it("maps every provider key readiness state safely", () => {
    const status: FirstRunSetupStatus = {
      productSession: {
        status: PRODUCT_SESSION_STATUSES.AUTHENTICATED,
        tenantId: "tenant_m3_demo",
        userId: "user_m3_demo",
        authSubject: "auth_subject_m3_demo",
        sessionId: "session_m3_demo"
      },
      googleOAuth: {
        provider: "google",
        status: GOOGLE_OAUTH_CONNECTION_STATUSES.CONNECTED,
        googleAccountId: "google_account_m3_demo",
        scopes: ["https://www.googleapis.com/auth/documents"]
      },
      providerSecrets: [
        { provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.MISSING },
        { provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.PENDING_VALIDATION },
        {
          provider: "OPENAI",
          status: PROVIDER_SECRET_READINESS_STATUSES.VALID,
          secretId: "secret_m3_demo",
          fingerprint: "fp_m3_demo",
          expiresAt: "2026-06-07T02:00:00.000Z"
        },
        { provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.INVALID },
        { provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.EXPIRED },
        { provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.VALIDATION_FAILED }
      ],
      resourceSession: { status: RESOURCE_SESSION_READINESS_STATUSES.NOT_STARTED },
      errors: [],
      updatedAt: "2026-06-06T18:00:00.000Z"
    };

    const viewModel = createFirstRunSetupViewModel(status);

    expect(viewModel.providerSecrets.map((provider) => provider.status)).toEqual([
      "Missing",
      "Pending validation",
      "Valid",
      "Invalid",
      "Expired",
      "Validation failed"
    ]);
    expect(JSON.stringify(viewModel)).not.toContain("secret_m3_demo");
  });

  it("keeps setup log payloads metadata-only even when backend errors include sensitive values", () => {
    const status: FirstRunSetupStatus = {
      productSession: {
        status: PRODUCT_SESSION_STATUSES.EXPIRED,
        error: {
          code: "AUTHENTICATION_EXPIRED",
          message: "Bearer bearer_live_token leaked in backend message"
        }
      },
      googleOAuth: {
        provider: "google",
        status: GOOGLE_OAUTH_CONNECTION_STATUSES.RECONNECT_REQUIRED,
        error: {
          code: "OAUTH_RECONNECT_REQUIRED",
          message: "oauth_token oauth_live_token and authorization_code_demo should not render"
        }
      },
      providerSecrets: [
        {
          provider: "OPENAI",
          status: PROVIDER_SECRET_READINESS_STATUSES.INVALID,
          error: {
            code: "PROVIDER_SECRET_INVALID",
            message: "prompt: revise raw document with sk-live-secret and selected text"
          }
        }
      ],
      resourceSession: {
        status: RESOURCE_SESSION_READINESS_STATUSES.NOT_READY,
        error: {
          code: "RESOURCE_SESSION_NOT_READY",
          message: "raw document text and model response are unavailable"
        }
      },
      errors: [
        {
          kind: "provider_secret_invalid",
          error: {
            code: "PROVIDER_SECRET_INVALID",
            message: "action payload contains sk-live-secret"
          }
        }
      ],
      updatedAt: "2026-06-06T18:00:00.000Z"
    };

    const viewModel = createFirstRunSetupViewModel(status);
    const safeLogEvent = createSafeSetupLogEvent(status, viewModel.ready);
    const serializedViewModel = JSON.stringify(viewModel);

    expect(safeSetupLogExcludesForbiddenContent(safeLogEvent)).toBe(true);
    expect(JSON.stringify(safeLogEvent)).not.toMatch(/sk-live-secret|oauth_live_token|raw document|model response/i);
    expect(serializedViewModel).not.toMatch(/sk-live-secret|oauth_live_token|raw document|model response|action payload/i);
    expect(viewModel.errors[0].message).toBe("Provider key validation failed. Enter a new key.");
  });

  it("detects unsafe setup log key names and values", () => {
    expect(safeSetupLogExcludesForbiddenContent({
      eventName: "first_run_setup_state_rendered",
      setupReady: false,
      updatedAt: "2026-06-06T18:00:00.000Z",
      productSessionStatus: PRODUCT_SESSION_STATUSES.ANONYMOUS,
      googleOAuthStatus: GOOGLE_OAUTH_CONNECTION_STATUSES.NOT_CONNECTED,
      providerSecretStatuses: [{ provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.MISSING }],
      resourceSessionStatus: "unknown",
      errorKinds: ["provider_secret_required"]
    })).toBe(true);

    expect(safeSetupLogExcludesForbiddenContent({
      eventName: "first_run_setup_state_rendered",
      setupReady: false,
      updatedAt: "2026-06-06T18:00:00.000Z",
      productSessionStatus: PRODUCT_SESSION_STATUSES.ANONYMOUS,
      googleOAuthStatus: GOOGLE_OAUTH_CONNECTION_STATUSES.NOT_CONNECTED,
      providerSecretStatuses: [{ provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.MISSING }],
      resourceSessionStatus: "unknown",
      errorKinds: ["provider_secret_required"],
      providerKey: "sk-live-secret"
    } as never)).toBe(false);

    expect(safeSetupLogExcludesForbiddenContent({
      eventName: "first_run_setup_state_rendered",
      setupReady: false,
      updatedAt: "2026-06-06T18:00:00.000Z",
      productSessionStatus: PRODUCT_SESSION_STATUSES.ANONYMOUS,
      googleOAuthStatus: GOOGLE_OAUTH_CONNECTION_STATUSES.NOT_CONNECTED,
      providerSecretStatuses: [{ provider: "OPENAI", status: PROVIDER_SECRET_READINESS_STATUSES.MISSING }],
      resourceSessionStatus: "unknown",
      errorKinds: ["prompt: raw document"]
    })).toBe(false);
  });
});
