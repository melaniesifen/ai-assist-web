import { describe, expect, it } from "vitest";
import {
  EXTENSION_SURFACE_STATES,
  describeGoogleDocsExtensionSurface
} from "../src/extension-surface";

describe("Google Docs extension surface contract", () => {
  it("enables the floating button and compact panel for supported Google Docs document pages", () => {
    const surface = describeGoogleDocsExtensionSurface({
      url: "https://docs.google.com/document/d/doc_123-abc/edit"
    });

    expect(surface.state).toBe(EXTENSION_SURFACE_STATES.READY);
    expect(surface.documentId).toBe("doc_123-abc");
    expect(surface.canInjectFloatingButton).toBe(true);
    expect(surface.canOpenAssistantPanel).toBe(true);
    expect(surface.userMessage).toBe("Assistant ready for this Google Doc.");
  });

  it("supports account-scoped Google Docs document URLs", () => {
    const surface = describeGoogleDocsExtensionSurface({
      url: "https://docs.google.com/document/u/1/d/doc_456-xyz/edit?tab=t.0"
    });

    expect(surface.state).toBe(EXTENSION_SURFACE_STATES.READY);
    expect(surface.documentId).toBe("doc_456-xyz");
  });

  it("returns a typed unsupported-page state without injecting UI for non-document pages", () => {
    const surface = describeGoogleDocsExtensionSurface({
      url: "https://docs.google.com/spreadsheets/d/sheet-123/edit"
    });

    expect(surface.state).toBe(EXTENSION_SURFACE_STATES.UNSUPPORTED_PAGE);
    expect(surface.documentId).toBeNull();
    expect(surface.canInjectFloatingButton).toBe(false);
    expect(surface.canOpenAssistantPanel).toBe(false);
    expect(surface.userMessage).toBe("Open a supported Google Docs document to use the assistant.");
  });

  it("returns a typed missing-document state for Google Docs pages without a document ID", () => {
    const surface = describeGoogleDocsExtensionSurface({
      url: "https://docs.google.com/document/create"
    });

    expect(surface.state).toBe(EXTENSION_SURFACE_STATES.MISSING_DOCUMENT_ID);
    expect(surface.documentId).toBeNull();
    expect(surface.canInjectFloatingButton).toBe(false);
    expect(surface.canOpenAssistantPanel).toBe(false);
    expect(surface.userMessage).toBe("The assistant could not identify the current Google Doc.");
  });

  it("keeps provider, Google mutation, HTTP, and SSE responsibilities backend-owned", () => {
    const surface = describeGoogleDocsExtensionSurface({
      url: "https://docs.google.com/document/d/doc_123/edit"
    });

    expect(surface.clientResponsibilities).toContain("Detect supported Google Docs pages before injecting UI.");
    expect(surface.clientResponsibilities).toContain("Open a compact assistant panel tied to the active document.");
    expect(surface.backendResponsibilities).toContain("Own authenticated HTTP command APIs and SSE session streams.");
    expect(surface.backendResponsibilities).toContain("Own all Google Docs read and mutation API calls through backend services.");
  });

  it("forbids local sensitive retention outside active user-visible state", () => {
    const surface = describeGoogleDocsExtensionSurface({
      url: "https://docs.google.com/document/d/doc_123/edit"
    });

    expect(surface.forbiddenLocalRetention).toContain("provider API keys");
    expect(surface.forbiddenLocalRetention).toContain("OAuth tokens");
    expect(surface.forbiddenLocalRetention).toContain("raw prompts");
    expect(surface.forbiddenLocalRetention).toContain("document text");
    expect(surface.forbiddenLocalRetention).toContain("model responses");
    expect(surface.forbiddenLocalRetention).toContain("action payloads");
  });
});
