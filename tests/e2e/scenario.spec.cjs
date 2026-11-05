const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../..");
const csvPath = path.join(root, "demo/products.csv");
const source = fs.readFile(csvPath, "utf8");
const response = fs.readFile(
  path.join(root, "demo/qwen-response.json"),
  "utf8",
);
const count = (page, name) => page.locator(`[data-count="${name}"]`);
async function demo(page) {
  await page.goto("/");
  await page.locator("#empty-demo").click();
  await expect(count(page, "ready")).toHaveText("10");
}
async function drafts(page) {
  await demo(page);
  await page.locator("#load-demo-response").click();
  await expect(count(page, "draft")).toHaveText("3");
}
async function openFirst(page) {
  await page
    .locator('tr[data-sku="ORG-001"]')
    .getByRole("button", { name: "Проверить" })
    .click();
  await expect(page.locator("#draft-title")).toBeVisible();
}
async function approveFirst(page) {
  await openFirst(page);
  await page.locator("#fact-review").check();
  await page.locator("#approve-card").click();
  await page.getByRole("link", { name: "Вернуться к каталогу" }).click();
  await expect(count(page, "approved")).toHaveText("1");
}
async function download(page, button) {
  const promise = page.waitForEvent("download");
  await button.click();
  const d = await promise;
  return fs.readFile(await d.path());
}
async function upload(page, kind, text) {
  await page
    .locator("#file-" + kind)
    .setInputFiles({
      name: kind + (kind === "csv" ? ".csv" : ".json"),
      mimeType: kind === "csv" ? "text/csv" : "application/json",
      buffer: Buffer.from(text),
    });
  await expect(page.locator("#main")).toHaveAttribute("aria-busy", "false");
}
async function capture(page, name) {
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.locator(".topbar").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(root, "docs/screens", name),
      fullPage: false,
    });
  }
}

test("C1–C7: end-to-end review, repeated answer, invalidation and exact downloaded CSV", async ({
  page,
}) => {
  await drafts(page);
  await capture(page, "01-catalog.png");
  await openFirst(page);
  await page.locator("#approve-card").click();
  await expect(page.locator("#notice")).toContainText("подтвердите сверку");
  await page.locator("#fact-review").check();
  await page.locator("#approve-card").click();
  await expect(page.locator("#fact-review")).toBeDisabled();
  await capture(page, "02-review.png");
  await page.getByRole("link", { name: "Вернуться к каталогу" }).click();
  await expect(count(page, "approved")).toHaveText("1");
  await page.locator("#load-demo-response").click();
  await expect(page.locator("#notice")).toContainText("Без изменений: 3");
  await expect(count(page, "approved")).toHaveText("1");
  await openFirst(page);
  await page
    .locator("#draft-title")
    .fill("Органайзер «Линия», серый, 20 × 10 × 8 см");
  await expect(page.locator("#fact-review")).not.toBeChecked();
  await page.locator("#save-draft").click();
  await page.getByRole("link", { name: "Вернуться к каталогу" }).click();
  await expect(count(page, "approved")).toHaveText("0");
  await expect(count(page, "draft")).toHaveText("3");
  await approveFirst(page);
  await page.locator("#status-filter").selectOption("ready");
  await expect(page.locator("#shown-count")).toHaveText("Показано 7 из 10");
  await expect(count(page, "approved")).toHaveText("1");
  await page.getByRole("link", { name: /Передача/ }).click();
  await expect(page.locator("#export-csv")).toHaveText(
    "Экспорт одобренных (1)",
  );
  await capture(page, "03-export.png");
  const actual = await download(page, page.locator("#export-csv"));
  const expected = await fs.readFile(
    path.join(root, "demo/expected-approved.csv"),
  );
  expect(actual.equals(expected)).toBe(true);
  await page.reload();
  await expect(page.locator("#export-csv")).toContainText("(1)");
});

test("CSV import, prompt, repeat import and changed catalog invalidate old answer", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "csv", await source);
  await expect(count(page, "ready")).toHaveText("10");
  await page
    .getByRole("checkbox", { name: "Выбрать ORG-001", exact: true })
    .check();
  await page.locator("#build-prompt").click();
  const prompt = await page.locator("#prompt-text").inputValue();
  expect(prompt).toContain('"width_cm": "20"');
  const id = prompt.match(/"catalog_id": "([^"]+)"/)[1];
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await upload(page, "response", await response);
  await expect(page.locator("#notice")).toContainText("другому каталогу");
  await expect(count(page, "ready")).toHaveText("10");
  const correct = JSON.parse(await response);
  correct.catalog_id = id;
  await upload(page, "response", JSON.stringify(correct));
  await expect(count(page, "draft")).toHaveText("3");
  await approveFirst(page);
  await upload(page, "csv", await source);
  await expect(page.locator("#notice")).toContainText("уже загружен");
  await expect(count(page, "approved")).toHaveText("1");
  const changed = (await source).replace(
    "Полипропилен;Серый;20",
    "Полипропилен;Белый;20",
  );
  await upload(page, "csv", changed);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(count(page, "approved")).toHaveText("1");
  await upload(page, "csv", changed);
  await page
    .getByRole("button", { name: "Заменить каталог", exact: true })
    .click();
  await expect(count(page, "ready")).toHaveText("10");
  await upload(page, "response", JSON.stringify(correct));
  await expect(page.locator("#notice")).toContainText("другому каталогу");
});

test("downloaded backup restores exact data and approval in a new browser context", async ({
  page,
  browser,
}) => {
  await drafts(page);
  await approveFirst(page);
  await page.getByRole("link", { name: /Передача/ }).click();
  const csv = await download(page, page.locator("#export-csv"));
  const backup = await download(page, page.locator("#download-backup"));
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto("http://127.0.0.1:8781/");
  await expect(fresh.locator("#empty-demo")).toBeVisible();
  await upload(fresh, "backup", backup.toString("utf8"));
  await fresh
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(count(fresh, "approved")).toHaveText("1");
  await expect(count(fresh, "ready")).toHaveText("7");
  await fresh.getByRole("link", { name: /Передача/ }).click();
  expect(
    (await download(fresh, fresh.locator("#export-csv"))).equals(csv),
  ).toBe(true);
  await fresh.reload();
  await expect(fresh.locator("#export-csv")).toContainText("(1)");
  await context.close();
});

test("invalid inputs are atomic; missing facts block generation; empty filters preserve counts", async ({
  page,
}) => {
  await drafts(page);
  for (const modify of [
    (r) => {
      r.cards[1].sku = "UNKNOWN";
    },
    (r) => {
      r.cards.push(r.cards[0]);
    },
    (r) => {
      r.cards[0].approved = true;
    },
  ]) {
    const bad = JSON.parse(await response);
    modify(bad);
    await upload(page, "response", JSON.stringify(bad));
    await expect(page.locator("#notice")).toHaveClass("error");
    await expect(count(page, "draft")).toHaveText("3");
  }
  await page.locator("#status-filter").selectOption("approved");
  await expect(page.getByText("Нет товаров по этим условиям")).toBeVisible();
  await expect(count(page, "draft")).toHaveText("3");
  await page
    .getByRole("button", { name: "Сбросить фильтр", exact: true })
    .click();
  const broken = (await source).replace("Металл;Чёрный;18", ";Чёрный;18");
  await upload(page, "csv", broken);
  await page
    .getByRole("button", { name: "Заменить каталог", exact: true })
    .click();
  await expect(count(page, "needs_data")).toHaveText("1");
  await expect(
    page.getByRole("checkbox", { name: "Выбрать ORG-003", exact: true }),
  ).toBeDisabled();
});

test("unsaved navigation and cancel preserve old approved copy", async ({
  page,
}) => {
  await drafts(page);
  await approveFirst(page);
  await openFirst(page);
  const before = await page.locator("#draft-title").inputValue();
  await page.locator("#draft-title").fill("Несохранённое название органайзера");
  await page.getByRole("link", { name: "Вернуться к каталогу" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Отмена", exact: true })
    .click();
  await expect(page.locator("#draft-title")).toHaveValue(
    "Несохранённое название органайзера",
  );
  await page.locator("#cancel-edit").click();
  await expect(page.locator("#draft-title")).toHaveValue(before);
  await page.getByRole("link", { name: "Вернуться к каталогу" }).click();
  await expect(count(page, "approved")).toHaveText("1");
});

test("corrupt storage is not silently overwritten and storage denial enables memory mode", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() =>
    localStorage.setItem("catalogdraft.state.v1", "{broken"),
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8781/");
  await expect(page.locator("#storage-alert")).toContainText(
    "Сохранённые данные повреждены.",
  );
  await page.locator("#empty-demo").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.locator("#empty-demo")).toBeVisible();
  await context.close();
  const blocked = await browser.newContext();
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("storage blocked");
      },
    }),
  );
  const p = await blocked.newPage();
  await p.goto("http://127.0.0.1:8781/");
  await p.locator("#empty-demo").click();
  await expect(
    p.getByText("Браузер не разрешает сохранение.", { exact: false }),
  ).toBeVisible();
  await expect(count(p, "ready")).toHaveText("10");
  await blocked.close();
});

test("mobile screen has no page overflow; review and export remain accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await drafts(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await capture(page, "04-mobile.png");
  await openFirst(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#fact-review").check();
  await page.locator("#approve-card").click();
  await page.getByRole("link", { name: /Передача/ }).click();
  await expect(page.locator("#export-csv")).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("standalone file opens independently, persists saved approval and supports browser back", async ({
  page,
}) => {
  await page.goto(pathToFileURL(path.join(root, "index.html")).href);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "К содержимому", exact: true }),
  ).toBeFocused();
  await page.locator("#empty-demo").click();
  await page.locator("#load-demo-response").click();
  await approveFirst(page);
  await openFirst(page);
  await page.goBack();
  await expect(count(page, "approved")).toHaveText("1");
  await page.reload();
  await expect(count(page, "approved")).toHaveText("1");
  await page.getByRole("link", { name: /Передача/ }).click();
  const csv = await download(page, page.locator("#export-csv"));
  expect(csv.toString("utf8")).toContain("ORG-001");
});
