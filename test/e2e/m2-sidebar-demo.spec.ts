import { expect, test } from "@playwright/test";

test("Sidebar demo works in Firefox", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Google Docs fixture document" })).toBeVisible();
  await expect(page.getByLabel("AI assistant side panel")).toBeVisible();
  await expect(page.getByText("Assistant side panel")).toBeVisible();
  await expect(page.getByLabel("Session metadata")).toContainText("gdoc_google_docs_demo");

  await page.getByLabel("Mock prompt").fill("Tighten the selected text");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Tighten the selected text")).toBeVisible();
  await expect(page.getByText("I found reviewable edits in the selected passage.")).toBeVisible();
  await expect(page.getByText("Mocked assistant response ready.")).toBeVisible();

  const firstReviewCard = page.getByRole("article").filter({ hasText: "action_review_replace" });
  await expect(firstReviewCard.getByText("+ <fixture proposed text>")).toBeVisible();
  await firstReviewCard.getByRole("button", { name: "Approve" }).click();
  await expect(firstReviewCard.getByText("Approved")).toBeVisible();

  await firstReviewCard.getByRole("button", { name: "Apply" }).click();
  await expect(firstReviewCard.getByText("Apply requested")).toBeVisible();
  await expect(firstReviewCard.getByLabel("Last backend-shaped command")).toContainText("actions.apply");
  await firstReviewCard.getByRole("button", { name: "Applied result" }).click();
  await expect(firstReviewCard.locator(".status-badge", { hasText: "Applied" })).toBeVisible();
  await expect(firstReviewCard.getByText("The backend reported the edit was applied once.")).toBeVisible();

  const insertReviewCard = page.getByRole("article").filter({ hasText: "action_review_insert" });
  await insertReviewCard.getByRole("button", { name: "Approve" }).click();
  await insertReviewCard.getByRole("button", { name: "Apply" }).click();
  await insertReviewCard.getByRole("button", { name: "Duplicate replay" }).click();
  await expect(insertReviewCard.locator(".apply-result-box").getByText("Duplicate replay")).toBeVisible();
  await expect(insertReviewCard.getByText("No duplicate document mutation occurred.")).toBeVisible();

  const approvedReviewCard = page.getByRole("article").filter({ hasText: "action_review_approved" });
  await approvedReviewCard.getByRole("button", { name: "Apply" }).click();
  await approvedReviewCard.getByRole("button", { name: "Denied" }).click();
  await expect(approvedReviewCard.locator(".apply-result-box").getByText("Denied", { exact: true })).toBeVisible();
  await expect(approvedReviewCard.getByText("AUTHORIZATION_DENIED")).toBeVisible();

  await expect(page.getByRole("status").filter({ hasText: "No document mutation occurred." }).first()).toBeVisible();
  await expect(page.getByText("The browser surface does not call provider APIs")).toBeVisible();
});

test("Session stream demo renders SSE and proposed-action states in Firefox", async ({ page }) => {
  await page.goto("/");

  const realFlowHarness = page.getByLabel("Real backend flow client states");
  await expect(realFlowHarness.getByText("http://localhost:8787/sessions/session_deployed_shape/events")).toBeVisible();
  await expect(realFlowHarness.getByText("After reconnect, duplicate event, malformed event, or sequence gap")).toBeVisible();
  await expect(realFlowHarness.getByText("Expired session")).toBeVisible();
  await expect(realFlowHarness.getByText("Provider unavailable")).toBeVisible();

  const streamHarness = page.getByLabel("Session stream harness");
  await expect(streamHarness).toBeVisible();
  await expect(streamHarness.getByText("No streamed progress yet.")).toBeVisible();

  await page.getByRole("button", { name: "Run stream" }).click();

  await expect(streamHarness.getByText("Loading approved context")).toBeVisible();
  await expect(streamHarness.getByText("Here is a streamed answer.")).toBeVisible();
  await expect(streamHarness.getByText("Required")).toBeVisible();
  await expect(streamHarness.getByText("evt-stream-11").first()).toBeVisible();
  await expect(streamHarness.getByText("Review one proposed edit.")).toBeVisible();
  await expect(streamHarness.getByText("APPROVED", { exact: true })).toBeVisible();
  await expect(streamHarness.getByText("REJECTED", { exact: true })).toBeVisible();
  await expect(streamHarness.getByText("EXPIRED", { exact: true })).toBeVisible();
  await expect(streamHarness.getByText("AUTHORIZATION_DENIED")).toBeVisible();
  await expect(streamHarness.getByText("SEQUENCE_GAP")).toBeVisible();
  await expect(streamHarness.getByText("INVALID_SESSION_EVENT")).toBeVisible();
  await expect(streamHarness.getByText("RATE_LIMITED")).toBeVisible();
  await expect(streamHarness.getByText("metadata only")).toBeVisible();
});
