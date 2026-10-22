# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-viewport.spec.ts >> QA-22 composer font size >> composer textarea font-size >= 16px on touch device (390×844)
- Location: test/owner/qa-viewport.spec.ts:71:3

# Error details

```
Error: composer font-size 13.3333px is below 16px

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 16
Received:    13.3333
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - complementary "App navigation" [ref=e4]:
      - navigation "Main destinations" [ref=e5]:
        - button "Back to chat" [ref=e6]: Sofie
        - button "Close navigation" [ref=e7]
        - group [ref=e10]:
          - generic "Advanced tools" [ref=e11]
      - navigation "Primary" [ref=e12]:
        - link "Our business" [ref=e13] [cursor=pointer]:
          - /url: /business
        - link "Today" [ref=e14] [cursor=pointer]:
          - /url: /today
        - link "Ask Sofie" [ref=e15] [cursor=pointer]:
          - /url: /chat
        - link "Work" [ref=e16] [cursor=pointer]:
          - /url: /work
        - link "Inbox" [ref=e17] [cursor=pointer]:
          - /url: /inbox
        - link "Needs You" [ref=e18] [cursor=pointer]:
          - /url: /needs-you
        - link "Approvals" [ref=e19] [cursor=pointer]:
          - /url: /approvals
        - link "Files" [ref=e20] [cursor=pointer]:
          - /url: /workspace
        - link "Results" [ref=e21] [cursor=pointer]:
          - /url: /results
        - link "Memory" [ref=e22] [cursor=pointer]:
          - /url: /memory
        - link "Knowledge" [ref=e23] [cursor=pointer]:
          - /url: /knowledge
        - link "Capsules" [ref=e24] [cursor=pointer]:
          - /url: /capsules
        - link "Agents" [ref=e25] [cursor=pointer]:
          - /url: /team
        - link "Rooms" [ref=e26] [cursor=pointer]:
          - /url: /rooms
        - link "Apps" [ref=e27] [cursor=pointer]:
          - /url: /apps
      - button "New conversation" [ref=e28]
      - textbox "Search threads" [ref=e33]
      - navigation [ref=e34]:
        - generic [ref=e35]:
          - paragraph [ref=e36]: Today
          - list [ref=e37]:
            - listitem [ref=e38]:
              - button "New chat6:37 AM" [ref=e39]:
                - generic [ref=e40]: New chat
                - text: 6:37 AM
              - generic [ref=e41]:
                - button "Pin New chat" [ref=e42]
                - button "Rename New chat" [ref=e45]
                - button "Delete New chat" [ref=e48]
    - main [ref=e51]:
      - generic [ref=e52]:
        - button "Open threads" [ref=e53]
        - status [ref=e56]:
          - generic [ref=e59]:
            - paragraph [ref=e60]: Limited mode
            - paragraph [ref=e61]: Reminders, Triggers, and 7 more need setup. Everything else remains available.
          - button "Review setup" [ref=e62]
        - generic [ref=e63]:
          - region "Messages" [ref=e64]:
            - log [ref=e65]:
              - generic [ref=e66]:
                - paragraph [ref=e67]: Sofie
                - heading "Hey Jay" [level=2] [ref=e68]
                - paragraph [ref=e69]: Ask me anything — available capabilities stay active while setup is completed.
              - region "Work in this conversation" [ref=e70]:
                - alert [ref=e71]:
                  - paragraph [ref=e72]: Work progress could not be refreshed. Check your connection and try again.
                  - button "Retry Work progress" [ref=e73]
          - button "Scroll to end" [ref=e74]
        - generic [ref=e78]:
          - generic [ref=e79]:
            - textbox "Message Sofie" [ref=e80]:
              - /placeholder: Message Sofie... (/ for commands)
            - generic [ref=e81]:
              - button "Attach files" [ref=e82]
              - generic [ref=e85]:
                - button "Select reasoning effort" [ref=e87]
                - button "Select model" [ref=e94]:
                  - generic [ref=e95]: claude-sonnet-5
                - button "Start voice input" [ref=e98]
                - button "Send" [disabled] [ref=e101]
          - paragraph [ref=e105]
```

# Test source

```ts
  1   | /**
  2   |  * Viewport regression tests for QA-12, QA-22, QA-39.
  3   |  *
  4   |  * Runs against the owner fixture server (http://127.0.0.1:3091, no DB, no model).
  5   |  * Specify project via --project=mobile or --project=desktop, or run all.
  6   |  *
  7   |  * Each test fails when its corresponding CSS fix is reverted:
  8   |  *   QA-12: remove @media (max-height:499px) → sidebar position:static in landscape.
  9   |  *   QA-22: remove the touch-device font-size rule → computed size < 16px.
  10  |  *   QA-39: remove .owner-footer a { min-height: 44px } → link height < 44px.
  11  |  */
  12  | import { test, expect } from "@playwright/test";
  13  | 
  14  | const BASE = "http://127.0.0.1:3091";
  15  | const PASSWORD = "local-beta-ui-fixture-only";
  16  | 
  17  | // Authenticate before each test using Playwright's API request (no Origin header).
  18  | test.beforeEach(async ({ context }) => {
  19  |   const response = await context.request.post(`${BASE}/api/auth/login`, {
  20  |     data: { password: PASSWORD },
  21  |   });
  22  |   expect(response.status()).toBe(200);
  23  |   const state = await context.storageState();
  24  |   await context.addCookies(
  25  |     state.cookies.map((c) => ({ ...c, secure: false })),
  26  |   );
  27  | });
  28  | 
  29  | // ──────────────────────────────────────────────────────────────────────────────
  30  | // QA-12 — Phone landscape: sidebar must be in overlay (fixed) mode
  31  | // ──────────────────────────────────────────────────────────────────────────────
  32  | 
  33  | test.describe("QA-12 landscape sidebar", () => {
  34  |   test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  35  | 
  36  |   test("sidebar is position:fixed in landscape (844×390) so chat is not collapsed", async ({ page }) => {
  37  |     await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  38  | 
  39  |     // Wait for the React app to hydrate: the data-chat-sidebar attribute is
  40  |     // added by chat.tsx and is the earliest reliable signal that the sidebar
  41  |     // is in the DOM after hydration.
  42  |     await page.locator("[data-chat-sidebar]").waitFor({ state: "attached", timeout: 20000 });
  43  | 
  44  |     const sidebar = page.locator("[data-chat-sidebar]");
  45  | 
  46  |     const position = await sidebar.evaluate((el) =>
  47  |       window.getComputedStyle(el).position,
  48  |     );
  49  |     // With the fix: position:fixed (overlay). Without fix: position:static.
  50  |     expect(position, "sidebar must be position:fixed in landscape").toBe("fixed");
  51  | 
  52  |     const visibility = await sidebar.evaluate((el) =>
  53  |       window.getComputedStyle(el).visibility,
  54  |     );
  55  |     // Sidebar must be hidden by default (user opens it on demand).
  56  |     expect(visibility, "sidebar must be hidden by default in landscape").toBe("hidden");
  57  | 
  58  |     // The sidebar-open button must be visible in landscape so the user can open the drawer.
  59  |     const toggle = page.getByRole("button", { name: "Open threads" }).first();
  60  |     await expect(toggle).toBeVisible({ timeout: 10000 });
  61  |   });
  62  | });
  63  | 
  64  | // ──────────────────────────────────────────────────────────────────────────────
  65  | // QA-22 — Composer textarea font-size ≥ 16px on touch (prevents iOS Safari zoom)
  66  | // ──────────────────────────────────────────────────────────────────────────────
  67  | 
  68  | test.describe("QA-22 composer font size", () => {
  69  |   test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  70  | 
  71  |   test("composer textarea font-size >= 16px on touch device (390×844)", async ({ page }) => {
  72  |     await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  73  | 
  74  |     // Wait for the composer to be rendered.
  75  |     const textarea = page.locator("textarea").first();
  76  |     await expect(textarea).toBeAttached({ timeout: 15000 });
  77  | 
  78  |     const fontSize = await textarea.evaluate((el) =>
  79  |       parseFloat(window.getComputedStyle(el as HTMLElement).fontSize),
  80  |     );
  81  |     // Without the fix: 13px (iOS zooms on focus). With fix: max(16px, 1em).
> 82  |     expect(fontSize, `composer font-size ${fontSize}px is below 16px`).toBeGreaterThanOrEqual(16);
      |                                                                        ^ Error: composer font-size 13.3333px is below 16px
  83  |   });
  84  | });
  85  | 
  86  | // ──────────────────────────────────────────────────────────────────────────────
  87  | // QA-39 — ProductShell footer links ≥ 44px height on touch
  88  | // ──────────────────────────────────────────────────────────────────────────────
  89  | 
  90  | test.describe("QA-39 footer link tap targets", () => {
  91  |   test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  92  | 
  93  |   test("product-shell footer links are at least 44px tall at 390×844", async ({ page }) => {
  94  |     // /privacy uses ProductShell which renders the .owner-footer.
  95  |     await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
  96  | 
  97  |     // Wait for footer to appear.
  98  |     const footer = page.locator("footer.owner-footer");
  99  |     await expect(footer).toBeAttached({ timeout: 15000 });
  100 | 
  101 |     const links = footer.locator("a");
  102 |     const count = await links.count();
  103 | 
  104 |     if (count === 0) {
  105 |       // Fallback: check /memory
  106 |       await page.goto(`${BASE}/memory`, { waitUntil: "domcontentloaded" });
  107 |       await expect(page.locator("footer.owner-footer")).toBeAttached({ timeout: 15000 });
  108 |     }
  109 | 
  110 |     const linkCount = await page.locator("footer.owner-footer a").count();
  111 |     expect(linkCount, "footer must contain at least one link").toBeGreaterThan(0);
  112 | 
  113 |     for (let i = 0; i < linkCount; i++) {
  114 |       const link = page.locator("footer.owner-footer a").nth(i);
  115 |       const box = await link.boundingBox();
  116 |       if (box === null) continue;
  117 |       const label = await link.textContent();
  118 |       expect(
  119 |         box.height,
  120 |         `Footer link "${label?.trim()}" height ${box.height}px < 44px`,
  121 |       ).toBeGreaterThanOrEqual(44);
  122 |     }
  123 |   });
  124 | });
  125 | 
```