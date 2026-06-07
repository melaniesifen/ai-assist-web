import { describe, expect, it } from "vitest";
import {
  M4_CONNECTOR_STATUSES,
  M4_CONSENT_STATUSES,
  M4_CONTEXT_MODES,
  createM4DemoReadinessStates,
  createM4ReadinessViewModel,
  createM4SafeLogEvent,
  safeM4LogExcludesForbiddenContent,
  type M4ConnectorResponseRef,
  type M4ContractErrorRef,
  type M4GoogleOAuthStatusRef,
  type M4NormalizedContextRef,
  type M4ReadinessInput
} from "../src/m4-readiness";

async function loadM4ContractFixtures(): Promise<{
  consentErrorFixtures: readonly { value: M4ContractErrorRef }[];
  googleOAuthReconnectRequiredFixture: { value: M4GoogleOAuthStatusRef };
  googleDocsReadPathConnectorFixtures: readonly { name: string; value: M4ConnectorResponseRef }[];
  normalizedContextFixtures: readonly { value: M4NormalizedContextRef }[];
  validateConnectorResponse: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateNormalizedContext: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
}> {
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const fixtures = await import("../../ai-assist-contracts/fixtures/google-docs-read-path.fixtures.js");
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const m1Fixtures = await import("../../ai-assist-contracts/fixtures/m1-google-docs-vertical-slice.fixtures.js");
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const m3Fixtures = await import("../../ai-assist-contracts/fixtures/m3-first-run-setup.fixtures.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const connectors = await import("../../ai-assist-contracts/src/connectors.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const context = await import("../../ai-assist-contracts/src/context.js");

  return {
    consentErrorFixtures: m1Fixtures.consentErrorFixtures,
    googleOAuthReconnectRequiredFixture: m3Fixtures.googleOAuthReconnectRequiredFixture,
    googleDocsReadPathConnectorFixtures: fixtures.googleDocsReadPathConnectorFixtures,
    normalizedContextFixtures: m1Fixtures.normalizedContextFixtures,
    validateConnectorResponse: connectors.validateConnectorResponse,
    validateNormalizedContext: context.validateNormalizedContext
  };
}

describe("M4 Google Docs read-path readiness", () => {
  it("maps shared SELECTION and ACTIVE_RESOURCE read-context fixtures into metadata-only view models", async () => {
    const {
      googleDocsReadPathConnectorFixtures,
      normalizedContextFixtures,
      validateConnectorResponse,
      validateNormalizedContext
    } = await loadM4ContractFixtures();
    const selectionResponse = googleDocsReadPathConnectorFixtures.find(
      (fixture) => fixture.name === "connector-google-docs-read-selection-success"
    )?.value;
    const activeResourceResponse = googleDocsReadPathConnectorFixtures.find(
      (fixture) => fixture.name === "connector-google-docs-read-active-resource-success"
    )?.value;
    const truncatedResponse = googleDocsReadPathConnectorFixtures.find(
      (fixture) => fixture.name === "connector-google-docs-read-active-resource-truncated"
    )?.value;

    expect(selectionResponse).toBeDefined();
    expect(activeResourceResponse).toBeDefined();
    expect(truncatedResponse).toBeDefined();
    expect(validateConnectorResponse(selectionResponse)).toMatchObject({ valid: true, issues: [] });
    expect(validateConnectorResponse(activeResourceResponse)).toMatchObject({ valid: true, issues: [] });
    expect(validateConnectorResponse(truncatedResponse)).toMatchObject({ valid: true, issues: [] });
    expect(validateNormalizedContext(normalizedContextFixtures[0].value)).toMatchObject({ valid: true, issues: [] });

    const selection = createM4ReadinessViewModel({
      id: "selection-contract",
      title: "Selection contract",
      contextMode: M4_CONTEXT_MODES.SELECTION,
      consentStatus: M4_CONSENT_STATUSES.ACTIVE,
      connectorResponse: selectionResponse
    });
    const activeResource = createM4ReadinessViewModel({
      id: "active-resource-contract",
      title: "Active resource contract",
      contextMode: M4_CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: M4_CONSENT_STATUSES.ACTIVE,
      connectorResponse: activeResourceResponse
    });
    const truncated = createM4ReadinessViewModel({
      id: "truncated-contract",
      title: "Truncated contract",
      contextMode: M4_CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: M4_CONSENT_STATUSES.ACTIVE,
      connectorResponse: truncatedResponse
    });

    expect(selection.tone).toBe("ready");
    expect(selection.contextLabel).toBe("Selection");
    expect(selection.metadata).toEqual(
      expect.arrayContaining([
        { label: "Content hash", value: "sha256:m1-selection" },
        { label: "Revision", value: "rev_m1" },
        { label: "Provenance", value: "connector verified" },
        { label: "Truncated", value: "false" }
      ])
    );
    expect(JSON.stringify(selection)).not.toContain("<fixture selected excerpt>");
    expect(activeResource.contextLabel).toBe("Active resource");
    expect(activeResource.metadata).toEqual(
      expect.arrayContaining([
        { label: "Content hash", value: "sha256:m1-active-resource" },
        { label: "Source", value: "connector_resource_excerpt" }
      ])
    );
    expect(JSON.stringify(activeResource)).not.toContain("<fixture active resource excerpt>");
    expect(truncated.metadata).toEqual(
      expect.arrayContaining([
        { label: "Truncated", value: "true" },
        { label: "Original length", value: "9000" },
        { label: "Truncation reason", value: "MAX_CONTEXT_BYTES" }
      ])
    );
  });

  it("renders active, missing, revoked, and expired consent states before connector calls", async () => {
    const { consentErrorFixtures } = await loadM4ContractFixtures();
    const [missing, revoked, expired] = consentErrorFixtures;
    const inputs: readonly M4ReadinessInput[] = [
      {
        id: "active-consent",
        title: "Active consent",
        contextMode: M4_CONTEXT_MODES.SELECTION,
        consentStatus: M4_CONSENT_STATUSES.ACTIVE
      },
      {
        id: "missing-consent",
        title: "Missing consent",
        contextMode: M4_CONTEXT_MODES.ACTIVE_RESOURCE,
        consentStatus: M4_CONSENT_STATUSES.MISSING,
        consentError: missing.value
      },
      {
        id: "revoked-consent",
        title: "Revoked consent",
        contextMode: M4_CONTEXT_MODES.SELECTION,
        consentStatus: M4_CONSENT_STATUSES.REVOKED,
        consentError: revoked.value
      },
      {
        id: "expired-consent",
        title: "Expired consent",
        contextMode: M4_CONTEXT_MODES.ACTIVE_RESOURCE,
        consentStatus: M4_CONSENT_STATUSES.EXPIRED,
        consentError: expired.value
      }
    ];
    const viewModels = inputs.map(createM4ReadinessViewModel);

    expect(viewModels.map((viewModel) => viewModel.consentLabel)).toEqual(["Active", "Missing", "Revoked", "Expired"]);
    expect(viewModels[1].failure?.message).toBe("Grant access to this Google Doc before reading context.");
    expect(viewModels[1].safeLogEvent.connectorStatus).toBe("not_called");
    expect(viewModels[2].safeLogEvent.connectorStatus).toBe("not_called");
    expect(viewModels[3].safeLogEvent.connectorStatus).toBe("not_called");
  });

  it("maps reconnect-required and permission failures to safe user messages", async () => {
    const { googleOAuthReconnectRequiredFixture, googleDocsReadPathConnectorFixtures } = await loadM4ContractFixtures();
    const permissionResponse = googleDocsReadPathConnectorFixtures.find(
      (fixture) => fixture.name === "connector-google-docs-read-permission-denied"
    )?.value;

    expect(permissionResponse).toBeDefined();

    const reconnect = createM4ReadinessViewModel({
      id: "reconnect-contract",
      title: "Reconnect contract",
      contextMode: M4_CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: M4_CONSENT_STATUSES.ACTIVE,
      googleOAuth: googleOAuthReconnectRequiredFixture.value
    });
    const permission = createM4ReadinessViewModel({
      id: "permission-contract",
      title: "Permission contract",
      contextMode: M4_CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: M4_CONSENT_STATUSES.ACTIVE,
      connectorResponse: permissionResponse
    });

    expect(reconnect.tone).toBe("blocked");
    expect(reconnect.userMessage).toBe("Reconnect Google before reading this document.");
    expect(permission.failure).toEqual({
      code: "GOOGLE_DOCS_READ_PERMISSION_DENIED",
      message: "The connected Google account cannot read this document."
    });
    expect(JSON.stringify([reconnect, permission])).not.toMatch(/Google connection must be refreshed|User is not authorized/i);
  });

  it("keeps M4 safe log events metadata-only and detects unsafe fields or values", () => {
    const readyInput = createM4DemoReadinessStates()[0];
    const event = createM4SafeLogEvent(readyInput);

    expect(safeM4LogExcludesForbiddenContent(event)).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(/document text|selected text|prompt|model response|authorization|oauth/i);
    expect(
      safeM4LogExcludesForbiddenContent({
        ...event,
        // @ts-expect-error - negative coverage for unsafe dynamic fields from future caller mistakes.
        documentText: "raw document text"
      })
    ).toBe(false);
    expect(
      safeM4LogExcludesForbiddenContent({
        ...event,
        failureCode: "prompt: raw document selected text model response"
      })
    ).toBe(false);
  });

  it("renders local demo coverage for required M4 read-path state families", () => {
    const viewModels = createM4DemoReadinessStates().map(createM4ReadinessViewModel);

    expect(viewModels.map((viewModel) => viewModel.id)).toEqual([
      "selection-ready",
      "active-resource-ready",
      "active-resource-truncated",
      "missing-consent",
      "revoked-consent",
      "expired-consent",
      "reconnect-required",
      "permission-failure"
    ]);
    expect(viewModels.filter((viewModel) => viewModel.tone === "ready")).toHaveLength(3);
    expect(viewModels.find((viewModel) => viewModel.id === "selection-ready")?.contextMode).toBe(M4_CONTEXT_MODES.SELECTION);
    expect(viewModels.find((viewModel) => viewModel.id === "active-resource-ready")?.contextMode).toBe(
      M4_CONTEXT_MODES.ACTIVE_RESOURCE
    );
    expect(viewModels.find((viewModel) => viewModel.id === "permission-failure")?.safeLogEvent.connectorStatus).toBe(
      M4_CONNECTOR_STATUSES.TERMINAL_ERROR
    );
  });
});
