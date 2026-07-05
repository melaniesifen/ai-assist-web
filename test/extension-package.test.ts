import { describe, expect, it } from "vitest";
import chromeManifest from "../extension/manifest.json";
import chromeConfig from "../extension/config.example.json";
import chromeContentScript from "../extension/content-script.js?raw";
import chromeSidepanelScript from "../extension/sidepanel.js?raw";
import chromeServiceWorkerScript from "../extension/service-worker.js?raw";
import firefoxManifest from "../extension/firefox/manifest.json";
import firefoxConfig from "../extension/firefox/config.example.json";
import firefoxBackgroundScript from "../extension/firefox/background.js?raw";
import firefoxContentScript from "../extension/firefox/content-script.js?raw";
import firefoxBuiltIndex from "../extension/firefox/dist/index.html?raw";
import firefoxSidebarScript from "../extension/firefox/sidebar.js?raw";

describe("extension package", () => {
  it("defines an installable Chrome side-panel shell for Google Docs documents", () => {
    expect(chromeManifest.manifest_version).toBe(3);
    expect(chromeManifest.side_panel.default_path).toBe("sidepanel.html");
    expect(chromeManifest.permissions).toEqual(expect.arrayContaining(["identity", "sidePanel", "storage", "tabs"]));
    expect(chromeManifest.host_permissions).toEqual([
      "https://docs.google.com/document/*",
      "https://*.execute-api.us-west-2.amazonaws.com/*"
    ]);
    expect(chromeManifest.content_scripts[0]).toMatchObject({
      matches: ["https://docs.google.com/document/*"],
      js: ["content-script.js"]
    });
  });

  it("defines an installable Firefox sidebar shell for Google Docs documents", () => {
    expect(firefoxManifest.manifest_version).toBe(2);
    expect(firefoxManifest.sidebar_action.default_panel).toBe("sidebar.html");
    expect(firefoxManifest.browser_action.default_title).toBe("Open AI Assist");
    expect(firefoxManifest.browser_specific_settings.gecko.id).toBe("ai-assist-dogfood@melsifen-ai-assist.com");
    expect(firefoxManifest.permissions).toEqual(
      expect.arrayContaining([
        "identity",
        "storage",
        "tabs",
        "https://docs.google.com/document/*",
        "https://*.execute-api.us-west-2.amazonaws.com/*"
      ])
    );
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
      expect(config.cognitoAuthBaseUrl).toMatch(/^https:\/\/ai-assist-dev-us-west-2-product-auth\.auth\.us-west-2\.amazoncognito\.com$/);
      expect(config.cognitoClientId).toBe("replace-with-dev-public-app-client-id");
      expect(config.googleOAuthRedirectTarget).toBe(config.cognitoRedirectUri);
      expect(config.cognitoResponseType).toBe("token");
      expect(serializedConfig).not.toMatch(/execute-api/i);
      expect(serializedConfig).not.toMatch(/bearer|id_token|access_token|refresh_token|secret|api[_-]?key|sk-/i);
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
      expect(panelScript).toContain("productAuthStatus");
      expect(panelScript).toContain("googleOAuthStatus");
      expect(panelScript).not.toContain("idToken");
      expect(panelScript).not.toContain("accessToken");
      expect(panelScript).not.toMatch(/innerText|document\.body|querySelectorAll/i);
    }
  });

  it("selects document context from the active tab instead of the last reporting Google Doc tab", () => {
    for (const backgroundScript of [chromeServiceWorkerScript, firefoxBackgroundScript]) {
      expect(backgroundScript).toContain("DOCUMENT_CONTEXTS_BY_TAB_STORAGE_KEY");
      expect(backgroundScript).toContain("documentContextForActiveTab(activeTab");
      expect(backgroundScript).toContain("contextsByTab[String(activeTab.id)]");
      expect(backgroundScript).toContain("detectDocumentContextFromUrl(activeTab.url");
      expect(backgroundScript).toContain("GOOGLE_DOCS_DOCUMENT_ID_PATTERN.exec(parsedUrl.pathname)");
    }
  });

  it("supports Cognito Hosted UI login without putting bearer values in the sidebar iframe URL", () => {
    expect(chromeSidepanelScript).toContain("AI_ASSIST_PRODUCT_SIGN_IN");
    expect(chromeSidepanelScript).toContain("AI_ASSIST_PRODUCT_SIGN_OUT");
    expect(firefoxSidebarScript).toContain("AI_ASSIST_PRODUCT_SIGN_IN");
    expect(firefoxSidebarScript).toContain("AI_ASSIST_PRODUCT_SIGN_OUT");

    expect(chromeSidepanelScript).not.toMatch(/id_token|access_token|Authorization|Bearer/);
    expect(firefoxSidebarScript).not.toMatch(/id_token|access_token|Authorization|Bearer/);
    expect(chromeSidepanelScript).toContain("appUrl.searchParams.set(\"productAuthStatus\"");
    expect(firefoxSidebarScript).toContain("appUrl.searchParams.set(\"productAuthStatus\"");
    expect(chromeSidepanelScript).toContain("appUrl.searchParams.set(\"googleOAuthStatus\"");
    expect(firefoxSidebarScript).toContain("appUrl.searchParams.set(\"googleOAuthStatus\"");
    expect(chromeSidepanelScript).toContain("appUrl.searchParams.set(\"contextStatus\"");
    expect(firefoxSidebarScript).toContain("appUrl.searchParams.set(\"contextStatus\"");
    expect(chromeSidepanelScript).toContain("canAttemptBackendCommand ? \"consent_required\" : \"idle\"");
    expect(firefoxSidebarScript).toContain("canAttemptBackendCommand ? \"consent_required\" : \"idle\"");
    expect(chromeSidepanelScript).toContain("appUrl.searchParams.set(\"providerStatus\"");
    expect(firefoxSidebarScript).toContain("appUrl.searchParams.set(\"providerStatus\"");
    expect(chromeSidepanelScript).toContain("appUrl.searchParams.set(\"commandStatus\"");
    expect(firefoxSidebarScript).toContain("appUrl.searchParams.set(\"commandStatus\"");
  });

  it("starts Google OAuth from the extension background with bearer headers and safe redirect targets", () => {
    for (const backgroundScript of [chromeServiceWorkerScript, firefoxBackgroundScript]) {
      expect(backgroundScript).toContain("AI_ASSIST_GOOGLE_CONNECT");
      expect(backgroundScript).toContain("AI_ASSIST_GOOGLE_OAUTH_STATUS");
      expect(backgroundScript).toContain("GOOGLE_OAUTH_START_PATH = \"/oauth/google/start\"");
      expect(backgroundScript).toContain("GOOGLE_OAUTH_STATUS_PATH = \"/oauth/google/status\"");
      expect(backgroundScript).toContain("Authorization: authorization");
      expect(backgroundScript).toContain("body: JSON.stringify({ redirectTarget: googleOAuthRedirectTarget(config) })");
      expect(backgroundScript).toContain("googleOAuthRedirectTarget ?? config.cognitoRedirectUri");
    }

    expect(chromeSidepanelScript).not.toContain("AI_ASSIST_GET_AUTHORIZATION_HEADER");
    expect(firefoxSidebarScript).not.toContain("AI_ASSIST_GET_AUTHORIZATION_HEADER");
  });

  it("keeps extension-side product auth token handling inside background boundaries", () => {
    expect(chromeSidepanelScript).not.toContain("chrome.storage");
    expect(firefoxSidebarScript).not.toContain("browser.storage");

    expect(chromeManifest.permissions).toContain("identity");
    expect(firefoxManifest.permissions).toContain("identity");
    expect(chromeServiceWorkerScript).toContain("params.get(\"state\") !== expectedState");
    expect(firefoxBackgroundScript).toContain("params.get(\"state\") !== expectedState");
    expect(firefoxBackgroundScript).toContain("let productAuthState");
  });

  it("validates Hosted UI state before extension backgrounds accept ID tokens", () => {
    expect(chromeServiceWorkerScript).toContain("parseHostedUiRedirect(redirectUrl, expectedState)");
    expect(chromeServiceWorkerScript).toContain("errorCode: \"state_mismatch\"");
    expect(chromeServiceWorkerScript).toContain("errorCode: \"id_token_required\"");
    expect(firefoxBackgroundScript).toContain("parseHostedUiRedirect(redirectUrl, expectedState)");
    expect(firefoxBackgroundScript).toContain("errorCode: \"state_mismatch\"");
    expect(firefoxBackgroundScript).toContain("errorCode: \"id_token_required\"");
  });

  it("builds Firefox iframe assets with relative paths so the sidebar can load them from dist", () => {
    expect(firefoxBuiltIndex).toContain("./assets/");
    expect(firefoxBuiltIndex).not.toMatch(/(?:src|href)="\/assets\//);
  });
});
