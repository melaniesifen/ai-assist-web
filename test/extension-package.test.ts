import { describe, expect, it } from "vitest";
import chromeManifest from "../extension/manifest.json";
import chromeConfig from "../extension/config.example.json";
import chromeContentScript from "../extension/content-script.js?raw";
import chromeSidepanelScript from "../extension/sidepanel.js?raw";
import firefoxManifest from "../extension/firefox/manifest.json";
import firefoxConfig from "../extension/firefox/config.example.json";
import firefoxBackgroundScript from "../extension/firefox/background.js?raw";
import firefoxContentScript from "../extension/firefox/content-script.js?raw";
import firefoxSidebarScript from "../extension/firefox/sidebar.js?raw";

describe("extension package", () => {
  it("defines an installable Chrome side-panel shell for Google Docs documents", () => {
    expect(chromeManifest.manifest_version).toBe(3);
    expect(chromeManifest.side_panel.default_path).toBe("sidepanel.html");
    expect(chromeManifest.permissions).toEqual(expect.arrayContaining(["sidePanel", "storage", "tabs"]));
    expect(chromeManifest.host_permissions).toEqual(["https://docs.google.com/document/*"]);
    expect(chromeManifest.content_scripts[0]).toMatchObject({
      matches: ["https://docs.google.com/document/*"],
      js: ["content-script.js"]
    });
  });

  it("defines an installable Firefox sidebar shell for Google Docs documents", () => {
    expect(firefoxManifest.manifest_version).toBe(2);
    expect(firefoxManifest.sidebar_action.default_panel).toBe("sidebar.html");
    expect(firefoxManifest.browser_action.default_title).toBe("Open AI Assist");
    expect(firefoxManifest.permissions).toEqual(expect.arrayContaining(["storage", "tabs", "https://docs.google.com/document/*"]));
    expect(firefoxManifest.content_scripts[0]).toMatchObject({
      matches: ["https://docs.google.com/document/*"],
      js: ["content-script.js"]
    });
    expect(firefoxBackgroundScript).toContain("browser.sidebarAction.open");
  });

  it("keeps committed extension endpoint examples secret-free", () => {
    for (const config of [chromeConfig, firefoxConfig]) {
      const serializedConfig = JSON.stringify(config);

      expect(config.apiBaseUrl).toBe("https://api.dev.example.test");
      expect(config.sseBaseUrl).toBe("https://sse.dev.melsifen-ai-assist.com");
      expect(config.supportingWebOrigin).toBe("https://dev.melsifen-ai-assist.com");
      expect(serializedConfig).not.toMatch(/execute-api/i);
      expect(serializedConfig).not.toMatch(/bearer|oauth|token|secret|api[_-]?key|sk-/i);
    }
  });

  it("hands the current Google Docs document ID to the side-panel UI without reading document content", () => {
    for (const contentScript of [chromeContentScript, firefoxContentScript]) {
      expect(contentScript).toContain("AI_ASSIST_DOC_CONTEXT");
      expect(contentScript).toContain("documentId");
      expect(contentScript).not.toMatch(/innerText|textContent|selection|document\.body|querySelectorAll/i);
    }

    for (const panelScript of [chromeSidepanelScript, firefoxSidebarScript]) {
      expect(panelScript).toContain("documentId");
      expect(panelScript).not.toMatch(/innerText|document\.body|querySelectorAll/i);
    }
  });
});
