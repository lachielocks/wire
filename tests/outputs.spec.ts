import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

function shotDir() {
  for (const dir of [
    process.env.WIRE_SHOTS,
    "/workspace/wire-shots",
    "test-results/wire-shots",
  ]) {
    if (!dir) continue;
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      /* CI runners cannot write /workspace */
    }
  }
  return "test-results/wire-shots";
}
const shots = shotDir();

test.use({ reducedMotion: "no-preference" });

async function bootExample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Examples" }).click();
  await page.getByRole("button", { name: /Cell, switch and bulb/ }).click();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
}

async function connect(page: Page, a: string, b: string) {
  await page.locator(`[data-terminal="${a}"]`).click();
  await page.locator(`[data-terminal="${b}"]`).click();
}

async function id(page: Page, kind: string) {
  return (await page.getByTestId(`part-${kind}`).getAttribute("data-part-id"))!;
}

async function blank(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("button", { name: /Blank canvas/ }).click();
  await page.getByRole("button", { name: "2D view", exact: true }).click();
}

test("the built-in example lights the bulb in 2D and 3D", async ({ page }) => {
  await bootExample(page);
  await expect(page.getByTestId("simulation-hint")).toHaveText(
    "Current is flowing.",
  );
  await expect(
    page.locator('[data-testid="part-lamp"] [data-output="on"]'),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/example-bulb-2d.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByTestId("experiment-canvas")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${shots}/example-bulb-3d.png`,
    fullPage: true,
  });
});

test("a battery-to-motor loop spins the motor, and a bulb lights", async ({
  page,
}) => {
  test.setTimeout(60000);
  await blank(page);
  await page.getByRole("button", { name: "Add Cell", exact: true }).click();
  await page.getByRole("button", { name: "Add Motor", exact: true }).click();
  const cell = await id(page, "cell"),
    motor = await id(page, "motor");
  await connect(page, `${cell}:1`, `${motor}:0`);
  await connect(page, `${motor}:1`, `${cell}:0`);
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await expect(page.getByTestId("simulation-hint")).toHaveText(
    "Current is flowing.",
  );
  await expect(
    page.locator('[data-testid="part-motor"] [data-output="on"]'),
  ).toBeVisible();
  const spinner = page.locator('[data-testid="part-motor"] .symbol-spin');
  await expect(spinner).toBeVisible();
  const first = await spinner.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(300);
  const second = await spinner.evaluate((el) => getComputedStyle(el).transform);
  expect(first).not.toBe(second);
  await page.screenshot({
    path: `${shots}/motor-spin-2d.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Add Bulb", exact: true }).click();
  const lamp = await id(page, "lamp");
  await page.getByRole("button", { name: "Add Cell", exact: true }).click();
  const cells = page.getByTestId("part-cell");
  await expect(cells).toHaveCount(2);
  const cell2 = (await cells.nth(1).getAttribute("data-part-id"))!;
  await connect(page, `${cell2}:1`, `${lamp}:0`);
  await connect(page, `${lamp}:1`, `${cell2}:0`);
  await expect(
    page.locator('[data-testid="part-lamp"] [data-output="on"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="part-motor"] [data-output="on"]'),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/motor-and-bulb-2d.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByTestId("experiment-canvas")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `${shots}/motor-and-bulb-3d.png`,
    fullPage: true,
  });
});

test("names an unconnected motor terminal in the status bar", async ({
  page,
}) => {
  await blank(page);
  await page.getByRole("button", { name: "Add Cell", exact: true }).click();
  await page.getByRole("button", { name: "Add Motor", exact: true }).click();
  const cell = await id(page, "cell"),
    motor = await id(page, "motor");
  await connect(page, `${cell}:1`, `${motor}:0`);
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
  await expect(page.getByTestId("simulation-hint")).toContainText(
    "isn't connected",
  );
  await expect(
    page.locator(`[data-terminal="${motor}:1"][data-open="true"]`),
  ).toBeVisible();
});

test("trips and replaces a fuse and renders overload in both views", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await blank(page);
  for (const component of [
    "Battery",
    "Fuse",
    "Bulb",
    "Diode",
    "Capacitor",
    "Inductor",
  ]) {
    await page
      .getByRole("button", { name: "Add " + component, exact: true })
      .click();
  }
  const [battery, fuse, bulb] = await Promise.all(
    ["battery", "fuse", "lamp"].map((kind) => id(page, kind)),
  );
  await connect(page, `${battery}:1`, `${fuse}:0`);
  await connect(page, `${fuse}:1`, `${bulb}:0`);
  await connect(page, `${bulb}:1`, `${battery}:0`);
  await page.getByTestId("part-fuse").click();
  await expect(page.getByText("Fuse blown", { exact: true })).toBeVisible();
  await expect(page.getByTestId("reading-current")).toHaveText("0 A");
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
  const flame = page.locator('[data-testid="part-lamp"] .fault-flame');
  const fuse2D = page.getByTestId("part-fuse");
  await expect(fuse2D).toHaveAttribute("data-fuse-state", "blown");
  await expect(fuse2D.getByText("Blown", { exact: true })).toBeVisible();
  await expect(flame).toHaveCount(0);
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  const fuse3D = page.locator('.physical-label[data-fuse-state="blown"]');
  await expect(fuse3D.getByText("Blown", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/blown-fuse-3d.png` });

  await page.getByRole("button", { name: "2D view", exact: true }).click();
  await page.getByTestId("part-battery").click();
  await page.getByLabel("Voltage", { exact: true }).fill("1.5");
  await fuse2D.click();
  await page.getByLabel("Current rating", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Replace fuse" }).click();
  await expect(fuse2D).toHaveAttribute("data-fuse-state", "intact");
  await expect(page.getByTestId("reading-current")).toHaveText("197.1 mA");
  await page.getByTestId("part-battery").click();
  await page.getByLabel("Voltage", { exact: true }).fill("4.5");
  await expect(fuse2D).toHaveAttribute("data-fuse-state", "blown");
  await expect(flame).toHaveCount(0);

  await fuse2D.click();
  await page.getByRole("button", { name: /^Delete component/ }).click();
  await connect(page, `${battery}:1`, `${bulb}:0`);
  await expect(flame).toBeVisible();
  await expect(flame).toHaveCSS("animation-name", "fault-flicker");
  await page.screenshot({ path: `${shots}/overload-2d.png` });
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByTestId("experiment-canvas")).toBeVisible();
  await expect(
    page.locator(".physical-label").filter({ hasText: "BulbOverload" }),
  ).toBeVisible();
  await page.screenshot({ path: `${shots}/overload-3d.png` });
  expect(errors).toEqual([]);
});
