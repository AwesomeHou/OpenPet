import fs from "node:fs/promises";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";

const fixtureHtml = `
  <!doctype html>
  <html>
    <body>
      <main>
        <textarea aria-label="Chat input"></textarea>
        <button id="send">Send</button>
        <section id="messages"></section>
      </main>
      <script>
        const send = document.getElementById("send");
        const messages = document.getElementById("messages");
        send.addEventListener("click", () => {
          send.setAttribute("data-openpet-sent", "true");
          const streaming = document.createElement("div");
          streaming.textContent = "streaming";
          streaming.setAttribute("data-openpet-streaming", "true");
          messages.appendChild(streaming);
          setTimeout(() => {
            streaming.removeAttribute("data-openpet-streaming");
            streaming.setAttribute("data-openpet-settled", "true");
            streaming.textContent = "done";
          }, 300);
        });
      </script>
    </body>
  </html>
`;

test("loads the extension, detects the target page, shows the overlay, and imports boba", async () => {
  test.setTimeout(60000);
  const distPath = path.resolve("dist");
  const popupPath = path.resolve("dist/popup.html");
  await fs.access(distPath);
  await fs.access(popupPath);

  const userDataDir = path.resolve(".tmp/playwright/user-data");
  await fs.rm(userDataDir, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
  });

  try {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }

    const extensionId = background.url().split("/")[2];
    const getActiveTabUrl = async () => {
      return background.evaluate(async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0]?.url ?? null;
      });
    };
    const page = await context.newPage();
    page.on("console", (message) => {
      console.log(`[page-console] ${message.type()}: ${message.text()}`);
    });
    await page.route("https://chat.deepseek.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: fixtureHtml,
      });
    });
    await page.route("https://example.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body><main>Example tab</main></body></html>",
      });
    });

    console.log("[e2e] navigating to fixture page");
    await page.goto("https://chat.deepseek.com/");
    await expect(page.getByRole("textbox", { name: "Chat input" })).toBeVisible();

    console.log("[e2e] waiting for overlay idle state");
    await expect
      .poll(
        async () => {
          return page.locator("#openpet-overlay-root .openpet-state").textContent();
        },
        { timeout: 10000 }
      )
      .toContain("idle");

    console.log("[e2e] sending message");
    await page.getByRole("button", { name: "Send" }).click();
    await expect
      .poll(
        async () => {
          return page.locator("#messages").textContent();
        },
        { timeout: 10000 }
      )
      .toContain("streaming");
    await expect
      .poll(
        async () => {
          return page.locator("#openpet-overlay-root .openpet-state").textContent();
        },
        { timeout: 10000 }
      )
      .toMatch(/thinking|streaming|done/);

    console.log("[e2e] opening popup");
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.setInputFiles("#pet-file", path.resolve("scratch/boba.zip"));
    await expect(popup.locator("#status")).toContainText("Imported boba");
    await expect(popup.locator("body")).toContainText("Selected pet: Boba");

    const overlayButton = page.locator("#openpet-overlay-root button");
    const overlayBox = await overlayButton.boundingBox();
    if (!overlayBox) {
      throw new Error("Overlay button did not render");
    }
    await page.mouse.move(
      overlayBox.x + overlayBox.width / 2,
      overlayBox.y + overlayBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      overlayBox.x + overlayBox.width / 2 - 60,
      overlayBox.y + overlayBox.height / 2 + 24,
      { steps: 8 }
    );
    await expect
      .poll(
        async () => {
          return page
            .locator("#openpet-overlay-root .openpet-sprite")
            .getAttribute("data-action");
        },
        { timeout: 10000 }
      )
      .toBe("running-left");
    await page.mouse.up();
    const draggedPlacement = await page.locator("#openpet-overlay-root").evaluate((node) => ({
      left: (node as HTMLElement).style.left,
      top: (node as HTMLElement).style.top,
      facing: (node as HTMLElement).dataset.facing ?? "",
    }));

    await page.evaluate(() => {
      const errorMessage = document.createElement("div");
      errorMessage.textContent = "error";
      document.body.appendChild(errorMessage);
    });
    await expect
      .poll(
        async () => {
          return page.locator("#openpet-overlay-root .openpet-state").textContent();
        },
        { timeout: 10000 }
      )
      .toContain("error");

    await page.reload();
    await expect(page.locator("#openpet-overlay-root .openpet-sprite")).toHaveCSS(
      "background-image",
      /data:image\/webp/,
      {
        timeout: 10000,
      }
    );

    const otherPage = await context.newPage();
    await otherPage.goto("https://example.com/");
    await otherPage.bringToFront();
    await expect
      .poll(
        async () => {
          return getActiveTabUrl();
        },
        { timeout: 10000 }
      )
      .toBe("https://example.com/");
    await expect(otherPage.locator("#openpet-overlay-root .openpet-state")).toContainText("idle");
    await expect
      .poll(
        async () => {
          return otherPage.locator("#openpet-overlay-root").evaluate((node) => ({
            left: (node as HTMLElement).style.left,
            top: (node as HTMLElement).style.top,
            facing: (node as HTMLElement).dataset.facing ?? "",
          }));
        },
        { timeout: 10000 }
      )
      .toEqual(draggedPlacement);

    await otherPage.evaluate(() => {
      (document.querySelector("#openpet-overlay-root button") as HTMLButtonElement | null)?.click();
    });
    await expect
      .poll(
        async () => {
          return getActiveTabUrl();
        },
        { timeout: 10000 }
      )
      .toBe("https://chat.deepseek.com/");
  } finally {
    await context.close();
  }
});
