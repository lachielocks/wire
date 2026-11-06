import { test, expect, type Page } from "@playwright/test";
async function boot(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await expect(page.locator("[data-terminal]")).toHaveCount(6);
}
async function blank(page: Page) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("button", { name: /Blank canvas/ }).click();
  await page.getByRole("button", { name: "2D view", exact: true }).click();
}
async function connect(page: Page, a: string, b: string) {
  await page.locator(`[data-terminal="${a}"]`).click();
  await page.locator(`[data-terminal="${b}"]`).click();
}
async function id(page: Page, kind: string) {
  return (await page.getByTestId(`part-${kind}`).getAttribute("data-part-id"))!;
}
async function expectRenderedExperiment(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const source = document.querySelector<HTMLCanvasElement>(
            '[data-testid="experiment-canvas"]',
          );
          if (!source || !source.width || !source.height) return 0;
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const ctx = copy.getContext("2d")!;
          ctx.drawImage(source, 0, 0);
          const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
          let equipmentPixels = 0;
          for (let i = 0; i < data.length; i += 4)
            if (
              data[i + 3] > 0 &&
              data[i] < 130 &&
              data[i + 1] < 130 &&
              data[i + 2] < 130
            )
              equipmentPixels++;
          return equipmentPixels;
        }),
      {
        timeout: 20000,
        message:
          "The WebGL canvas should contain rendered equipment, not just the tabletop.",
      },
    )
    .toBeGreaterThan(100);
}
test("loads the working circuit without runtime errors and shows the physical experiment", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  await expect(page.getByTestId("experiment-canvas")).toBeVisible();
  await expect(page.getByText("3D is taking a break.")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Toggle physical Switch", exact: true }),
  ).toBeVisible();
  await expectRenderedExperiment(page);
  await page.screenshot({ path: "test-results/wire-desktop.png" });
  expect(errors).toEqual([]);
});
test("toggles a real switch and updates lamp measurements", async ({
  page,
}) => {
  await boot(page);
  await page.getByTestId("part-switch").click();
  await page.getByTestId("switch-toggle").click();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
  await page.getByTestId("part-lamp").click();
  await expect(page.getByTestId("reading-current")).toHaveText("0 A");
  await page.getByTestId("part-switch").dblclick();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await page.getByTestId("part-lamp").click();
  await expect(page.getByTestId("reading-current")).toHaveText("197.1 mA");
});
test("builds a functional cell and lamp circuit from a blank project", async ({
  page,
}) => {
  await boot(page);
  await blank(page);
  await page.getByRole("button", { name: "Add Cell", exact: true }).click();
  await page.getByRole("button", { name: "Add Lamp", exact: true }).click();
  const cell = await id(page, "cell"),
    lamp = await id(page, "lamp");
  await connect(page, `${cell}:0`, `${lamp}:0`);
  await connect(page, `${cell}:1`, `${lamp}:1`);
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await page.getByTestId("part-lamp").click();
  await expect(page.getByTestId("reading-current")).toHaveText("197.4 mA");
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByTestId("experiment-canvas")).toBeVisible();
});
test("moves, rotates, deletes, undoes, redoes and copies with real shortcuts", async ({
  page,
}) => {
  await boot(page);
  await page.getByTestId("part-lamp").click();
  await page.keyboard.press("r");
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("part-lamp")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("part-lamp")).toHaveCount(1);
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("part-lamp")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await page.getByTestId("part-lamp").click();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("part-lamp")).toHaveCount(2);
});
test("saves to IndexedDB, recovers after reload, and opens a saved project", async ({
  page,
}) => {
  await boot(page);
  await page.getByTestId("part-switch").dblclick();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .getByRole("button", { name: /A little light.*3 components/ })
    .click();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
});
test("exports actual SVG, PNG, 3D screenshot and project files", async ({
  page,
}) => {
  await boot(page);
  await expect(page.getByTestId("experiment-canvas")).toBeVisible();
  await expectRenderedExperiment(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  for (const [name, suffix] of [
    ["Schematic · SVG", ".svg"],
    ["Schematic · PNG", ".png"],
    ["Experiment · PNG", "-3D.png"],
    ["Wire project · JSON", ".wire.json"],
  ]) {
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toContain(suffix);
    expect(await file.failure()).toBeNull();
  }
});
test("series and parallel examples use the solver and survive project export/import", async ({
  page,
}) => {
  await boot(page);
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.getByRole("button", { name: /Two lamps in series/ }).click();
  await expect(page.getByTestId("part-lamp")).toHaveCount(2);
  await page.getByTestId("part-lamp").first().click();
  await expect(page.getByTestId("reading-current")).toHaveText("99.3 mA");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.getByRole("button", { name: /Two paths, one circuit/ }).click();
  await page.getByTestId("part-lamp").first().click();
  await expect(page.getByTestId("reading-current")).toHaveText("194.3 mA");
});
test("keeps shortcuts out of text fields and validates invalid imports", async ({
  page,
}) => {
  await boot(page);
  await page.getByTestId("part-lamp").click();
  await page
    .getByRole("textbox", { name: "Component label" })
    .fill("Warm lamp");
  await page
    .getByRole("textbox", { name: "Component label" })
    .press("Backspace");
  await expect(page.getByTestId("part-lamp")).toHaveCount(1);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.wire.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(
    page.getByText("This is not a supported Wire project (version 1)."),
  ).toBeVisible();
});
test("supports a narrow screen without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.getByRole("button", { name: "Toggle inspector" }).click();
  await page.getByRole("button", { name: "Show components" }).click();
  await page.getByRole("button", { name: "Add Resistor", exact: true }).click();
  await expect(page.getByTestId("part-resistor")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByTestId("experiment-canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/wire-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a physical switch updates the same circuit as the schematic", async ({
  page,
}) => {
  await boot(page);
  const physical = page.getByRole("button", {
    name: "Toggle physical Switch",
    exact: true,
  });
  await expect(physical).toBeVisible();
  await physical.click();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
  await page.getByTestId("part-lamp").click();
  await expect(page.getByTestId("reading-current")).toHaveText("0 A");
  await physical.click();
  await expect(page.getByTestId("reading-current")).toHaveText("197.1 mA");
});
test("drags parts from the library, moves them on the grid, and uses a context menu", async ({
  page,
}) => {
  await boot(page);
  await blank(page);
  await page
    .getByRole("button", { name: "Add Cell", exact: true })
    .dragTo(page.getByTestId("schematic"), {
      targetPosition: { x: 200, y: 180 },
    });
  const part = page.getByTestId("part-cell");
  await expect(part).toBeVisible();
  const before = await part.getAttribute("transform");
  const box = (await part.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(await part.getAttribute("transform")).not.toBe(before);
  await part.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Rotate/ }).click();
  await expect(part.locator('g[transform="rotate(90)"]')).toHaveCount(1);
});
test("creates an explicit junction without changing the existing circuit", async ({
  page,
}) => {
  await boot(page);
  const cell = await id(page, "cell"),
    sw = await id(page, "switch");
  const a = (await page.locator(`[data-terminal="${cell}:1"]`).boundingBox())!,
    b = (await page.locator(`[data-terminal="${sw}:0"]`).boundingBox())!;
  await page.mouse.dblclick(
    (a.x + a.width / 2 + b.x + b.width / 2) / 2,
    a.y + a.height / 2,
  );
  await expect(page.locator(".wire")).toHaveCount(4);
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".wire")).toHaveCount(3);
});
test("connects circuit terminals using only keyboard-accessible controls", async ({
  page,
}) => {
  await boot(page);
  await blank(page);
  await page.getByRole("button", { name: "Add Cell", exact: true }).click();
  await page.getByRole("button", { name: "Add Lamp", exact: true }).click();
  for (const t of ["one", "two"]) {
    await page
      .getByRole("button", { name: `Cell terminal ${t}`, exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: `Lamp terminal ${t}`, exact: true })
      .focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
});
test("switches theme and uses a high contrast dark workspace", async ({
  page,
}) => {
  await boot(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({ path: "test-results/wire-dark.png" });
});

test("drags a wire endpoint to reconnect the actual electrical graph", async ({
  page,
}) => {
  await boot(page);
  const cell = await id(page, "cell"),
    sw = await id(page, "switch");
  const a = (await page.locator(`[data-terminal="${cell}:1"]`).boundingBox())!,
    b = (await page.locator(`[data-terminal="${sw}:0"]`).boundingBox())!;
  await page.mouse.click(
    (a.x + a.width / 2 + b.x + b.width / 2) / 2,
    a.y + a.height / 2,
  );
  const handle = (await page
      .locator(".wire.selected circle.wire-handle")
      .nth(1)
      .boundingBox())!,
    target = (await page.locator(`[data-terminal="${sw}:1"]`).boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.getByTestId("part-switch").dblclick();
  // The rewired circuit bypasses this switch; opening it must leave the lamp powered.
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await page.getByTestId("part-lamp").click();
  await expect(page.getByTestId("reading-current")).toHaveText("197.4 mA");
});
test("round-trips a project through its downloaded JSON file", async ({
  page,
}) => {
  await boot(page);
  await page.getByTestId("part-cell").click();
  await page.getByLabel("Voltage", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Wire project · JSON/ }).click();
  const file = await (await download).path();
  expect(file).toBeTruthy();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await blank(page);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(file!);
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Circuit complete",
  );
  await page.getByTestId("part-cell").click();
  await expect(page.getByLabel("Voltage", { exact: true })).toHaveValue("3");
});

test("keeps the schematic and simulator working when WebGL is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(type)) return null;
      return original.call(this, type, options);
    } as typeof original;
  });
  await boot(page);
  await expect(
    page.getByText("3D is taking a break.", { exact: true }),
  ).toBeVisible();
  await page.getByTestId("part-switch").dblclick();
  await expect(page.getByTestId("simulation-status")).toHaveText(
    "Open circuit",
  );
});
