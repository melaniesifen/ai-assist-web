import { describe, expect, it } from "vitest";
import {
  CONNECTOR_STATUSES,
  CONSENT_STATUSES,
  CONTEXT_MODES,
  createGoogleDocsReadinessDemoStates,
  createGoogleDocsReadinessViewModel,
  createContextReadinessLogEvent,
  safeContextReadinessLogExcludesForbiddenContent,
  type ConnectorResponseRef,
  type ContractErrorRef,
  type GoogleOAuthStatusRef,
  type NormalizedContextRef,
  type ContextReadinessInput
} from "../src/context-readiness";

async function loadGoogleDocsReadPathContractFixtures(): Promise<{
  consentErrorFixtures: readonly { value: ContractErrorRef }[];
  googleOAuthReconnectRequiredFixture: { value: GoogleOAuthStatusRef };
  googleDocsReadPathConnectorFixtures: readonly { name: string; value: ConnectorResponseRef }[];
  normalizedContextFixtures: readonly { value: NormalizedContextRef }[];
  validateConnectorResponse: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
  validateNormalizedContext: (value: unknown) => { valid: boolean; issues: readonly unknown[] };
}> {
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const fixtures = await import("../../ai-assist-contracts/fixtures/google-docs-read-path.fixtures.js");
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const googleDocsFixtures = await import("../../ai-assist-contracts/fixtures/google-docs-vertical-slice.fixtures.js");
  // @ts-expect-error - sibling contract fixtures are JavaScript-only until contracts publish generated TypeScript types.
  const setupFixtures = await import("../../ai-assist-contracts/fixtures/first-run-setup.fixtures.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const connectors = await import("../../ai-assist-contracts/src/connectors.js");
  // @ts-expect-error - sibling contract validators are JavaScript-only until contracts publish generated TypeScript types.
  const context = await import("../../ai-assist-contracts/src/context.js");

  return {
    consentErrorFixtures: googleDocsFixtures.consentErrorFixtures,
    googleOAuthReconnectRequiredFixture: setupFixtures.googleOAuthReconnectRequiredFixture,
    googleDocsReadPathConnectorFixtures: fixtures.googleDocsReadPathConnectorFixtures,
    normalizedContextFixtures: googleDocsFixtures.normalizedContextFixtures,
    validateConnectorResponse: connectors.validateConnectorResponse,
    validateNormalizedContext: context.validateNormalizedContext
  };
}

describe("Google Docs read-path readiness", () => {
  it("maps shared SELECTION and ACTIVE_RESOURCE read-context fixtures into metadata-only view models", async () => {
    const {
      googleDocsReadPathConnectorFixtures,
      normalizedContextFixtures,
      validateConnectorResponse,
      validateNormalizedContext
    } = await loadGoogleDocsReadPathContractFixtures();
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

    const selection = createGoogleDocsReadinessViewModel({
      id: "selection-contract",
      title: "Selection contract",
      contextMode: CONTEXT_MODES.SELECTION,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      connectorResponse: selectionResponse
    });
    const activeResource = createGoogleDocsReadinessViewModel({
      id: "active-resource-contract",
      title: "Active resource contract",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      connectorResponse: activeResourceResponse
    });
    const truncated = createGoogleDocsReadinessViewModel({
      id: "truncated-contract",
      title: "Truncated contract",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      connectorResponse: truncatedResponse
    });

    expect(selection.tone).toBe("ready");
    expect(selection.contextLabel).toBe("Selection");
    expect(selection.metadata).toEqual(
      expect.arrayContaining([
        { label: "Content hash", value: "sha256:google-docs-selection" },
        { label: "Revision", value: "rev_google_docs" },
        { label: "Provenance", value: "connector verified" },
        { label: "Truncated", value: "false" }
      ])
    );
    expect(JSON.stringify(selection)).not.toContain("<fixture selected excerpt>");
    expect(activeResource.contextLabel).toBe("Active resource");
    expect(activeResource.metadata).toEqual(
      expect.arrayContaining([
        { label: "Content hash", value: "sha256:google-docs-active-resource" },
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
    const { consentErrorFixtures } = await loadGoogleDocsReadPathContractFixtures();
    const [missing, revoked, expired] = consentErrorFixtures;
    const inputs: readonly ContextReadinessInput[] = [
      {
        id: "active-consent",
        title: "Active consent",
        contextMode: CONTEXT_MODES.SELECTION,
        consentStatus: CONSENT_STATUSES.ACTIVE
      },
      {
        id: "missing-consent",
        title: "Missing consent",
        contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
        consentStatus: CONSENT_STATUSES.MISSING,
        consentError: missing.value
      },
      {
        id: "revoked-consent",
        title: "Revoked consent",
        contextMode: CONTEXT_MODES.SELECTION,
        consentStatus: CONSENT_STATUSES.REVOKED,
        consentError: revoked.value
      },
      {
        id: "expired-consent",
        title: "Expired consent",
        contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
        consentStatus: CONSENT_STATUSES.EXPIRED,
        consentError: expired.value
      }
    ];
    const viewModels = inputs.map(createGoogleDocsReadinessViewModel);

    expect(viewModels.map((viewModel) => viewModel.consentLabel)).toEqual(["Active", "Missing", "Revoked", "Expired"]);
    expect(viewModels[1].failure?.message).toBe("Grant access to this Google Doc before reading context.");
    expect(viewModels[1].safeLogEvent.connectorStatus).toBe("not_called");
    expect(viewModels[2].safeLogEvent.connectorStatus).toBe("not_called");
    expect(viewModels[3].safeLogEvent.connectorStatus).toBe("not_called");
  });

  it("maps reconnect-required and permission failures to safe user messages", async () => {
    const { googleOAuthReconnectRequiredFixture, googleDocsReadPathConnectorFixtures } = await loadGoogleDocsReadPathContractFixtures();
    const permissionResponse = googleDocsReadPathConnectorFixtures.find(
      (fixture) => fixture.name === "connector-google-docs-read-permission-denied"
    )?.value;

    expect(permissionResponse).toBeDefined();

    const reconnect = createGoogleDocsReadinessViewModel({
      id: "reconnect-contract",
      title: "Reconnect contract",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
      googleOAuth: googleOAuthReconnectRequiredFixture.value
    });
    const permission = createGoogleDocsReadinessViewModel({
      id: "permission-contract",
      title: "Permission contract",
      contextMode: CONTEXT_MODES.ACTIVE_RESOURCE,
      consentStatus: CONSENT_STATUSES.ACTIVE,
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

  it("keeps Google Docs read-path safe log events metadata-only and detects unsafe fields or values", () => {
    const readyInput = createGoogleDocsReadinessDemoStates()[0];
    const event = createContextReadinessLogEvent(readyInput);

    expect(safeContextReadinessLogExcludesForbiddenContent(event)).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(/document text|selected text|prompt|model response|authorization|oauth/i);
    expect(
      safeContextReadinessLogExcludesForbiddenContent({
        ...event,
        // @ts-expect-error - negative coverage for unsafe dynamic fields from future caller mistakes.
        documentText: "raw document text"
      })
    ).toBe(false);
    expect(
      safeContextReadinessLogExcludesForbiddenContent({
        ...event,
        failureCode: "prompt: raw document selected text model response"
      })
    ).toBe(false);
  });

  it("renders local demo coverage for required Google Docs read-path state families", () => {
    const viewModels = createGoogleDocsReadinessDemoStates().map(createGoogleDocsReadinessViewModel);

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
    expect(viewModels.find((viewModel) => viewModel.id === "selection-ready")?.contextMode).toBe(CONTEXT_MODES.SELECTION);
    expect(viewModels.find((viewModel) => viewModel.id === "active-resource-ready")?.contextMode).toBe(
      CONTEXT_MODES.ACTIVE_RESOURCE
    );
    expect(viewModels.find((viewModel) => viewModel.id === "permission-failure")?.safeLogEvent.connectorStatus).toBe(
      CONNECTOR_STATUSES.TERMINAL_ERROR
    );
  });
});
