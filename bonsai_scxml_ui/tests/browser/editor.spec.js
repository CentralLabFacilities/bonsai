import { test, expect } from "@playwright/test";

const skill = "demo.skills.Work";
const definition = {
    description: "Deterministic browser-test skill",
    params: [{ key: "count", type: "Integer", default: "1", required: true }],
    inSlots: [{ key: "input", type: "String" }], outSlots: [],
    events: [{ event: "done", description: "Work completed" }],
};

test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        await route.fulfill({ json: pathname === "/api/skills" ? { skills: [skill] } : definition });
    });
});

async function openEditor(page) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true })).toBeVisible();
    // Pin available Linux fonts for cross-machine screenshot reproducibility.
    await page.addStyleTag({ content: ":root { --ui-font-family: 'Liberation Sans', sans-serif; } code, pre, .code-area { font-family: 'Liberation Mono', monospace; }" });
    await page.evaluate(() => document.fonts.ready);
}

test("desktop layout and collapsed panels retain their visual baseline", async ({ page }) => {
    await openEditor(page);
    await expect(page.locator(".app")).toHaveAttribute("data-panel-mode", "docked");
    await expect(page).toHaveScreenshot("desktop-editor.png");
    await page.locator(".editor-panel-ledge-library").click();
    await page.locator(".editor-panel-ledge-inspector").click();
    await expect(page).toHaveScreenshot("desktop-collapsed.png");
    await expect(page.locator(".react-flow")).toBeVisible();
});

test("narrow drawers fit the viewport and restore keyboard focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const ledge = page.locator(".editor-panel-ledge-library");
    await ledge.click();
    await expect(page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true })).toBeVisible();
    const panel = page.locator("#editor-library-panel");
    const bounds = await panel.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.addStyleTag({ content: ":root { --ui-font-family: 'Liberation Sans', sans-serif; }" });
    await expect(page).toHaveScreenshot("mobile-library.png");
    await page.getByRole("textbox", { name: "Search skills" }).focus();
    await page.keyboard.press("Escape");
    await expect(ledge).toBeFocused();
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("keyboard Add and real HTML dragging insert full skill nodes", async ({ page }) => {
    await openEditor(page);
    const add = page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(1);
    await expect(page.locator(".skill-add-feedback")).toContainText("Added Work");
    await page.locator(".skill-item-name").dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 300, y: 300 } });
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(2);
    await page.getByRole("button", { name: "Overview Mode", exact: true }).click();
    await expect(page).toHaveScreenshot("editor-with-skills.png");
});

test("failed backend loading is distinct from empty and recovers with retry", async ({ page }) => {
    await page.unroute("**/api/**");
    let failed = true;
    await page.route("**/api/**", (route) => route.fulfill({ status: failed ? 503 : 200, json: { skills: [] } }));
    await page.goto("/");
    await expect(page.locator('.skill-library [role="alert"]')).toContainText("503");
    await expect(page.getByText("The skill library is empty", { exact: true })).toHaveCount(0);
    failed = false;
    await page.getByRole("button", { name: "Retry loading skills", exact: true }).click();
    await expect(page.locator('.skill-library [role="alert"]')).toHaveCount(0);
    await expect(page.getByText("The skill library is empty", { exact: true })).toBeVisible();
});

test("skill finding accepts noncontiguous fuzzy matches and recovers from no match", async ({ page }) => {
    await openEditor(page);
    const search = page.getByRole("textbox", { name: "Search skills" });
    await search.fill("wk");
    await expect(page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true })).toBeVisible();
    await search.fill("zzzzzzzzzzzzzz");
    await expect(page.getByText("No matching skills", { exact: true })).toBeVisible();
    await search.fill("");
    await expect(page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true })).toBeVisible();
});

test("a committed Integer mismatch shows a badge and clearing a valid row works with an invalid sibling", async ({ page }) => {
    const parameters = [
        { key: "count", type: "Integer", default: "1", required: true },
        { key: "broken", type: "Integer", default: "'not-an-integer'", required: true },
    ];
    await page.route("**/api/skill/**", (route) => route.fulfill({ json: { ...definition, params: parameters, inSlots: [], outSlots: [] } }));
    await openEditor(page);
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    const node = page.locator(".react-flow__node-custom");
    await expect(node.locator(".node-warning-badge")).toBeVisible();
    await expect(node.locator(".node-warning-badge")).toHaveAttribute("title", /broken.*Integer|Integer.*broken/);
    await node.click();
    await page.getByRole("tab", { name: "Parameter", exact: true }).click();
    const groups = page.locator(".parameter-card");
    const count = groups.nth(0).getByRole("combobox");
    const broken = groups.nth(1).getByRole("combobox");
    await count.fill("7");
    await count.press("Enter");
    await expect(count).toHaveValue("7");
    await count.fill("");
    await count.press("Enter");
    await page.getByRole("tab", { name: "Overall", exact: true }).click();
    await page.getByRole("tab", { name: "Parameter", exact: true }).click();
    await expect(count).toHaveValue("");
    await expect(broken).toHaveValue("");
    await expect(broken).toHaveAttribute("placeholder", "'not-an-integer'");
    await broken.fill("9");
    await broken.press("Enter");
    await expect(node.locator(".node-warning-badge")).toHaveCount(0);
    await page.getByRole("tab", { name: "Problems", exact: true }).click();
    await expect(page.locator(".problems-panel")).toContainText("Full workflow validation unavailable");
    await expect(page.getByText("No problems found", { exact: true })).toHaveCount(0);
});

test("all connection points are smaller circles with the original large hit areas", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    const node = page.locator(".react-flow__node-custom");
    const paint = (element) => {
        const style = getComputedStyle(element, "::after");
        const outline = getComputedStyle(element, "::before");
        const bounds = element.getBoundingClientRect();
        return { clipPath: style.clipPath, borderRadius: style.borderRadius, visibleWidth: style.width,
            outlineWidth: outline.width, width: bounds.width, height: bounds.height };
    };
    for (const name of [".source-handle", ".target-handle", ".slot-skill-read-handle"]) {
        const style = await node.locator(name).first().evaluate(paint);
        expect(style.clipPath).toBe("none");
        expect(style.borderRadius).toBe("50%");
        expect(style.visibleWidth).toBe("10px");
        expect(style.outlineWidth).toBe("14px");
        expect(style.width).toBeGreaterThanOrEqual(24);
        expect(style.height).toBeGreaterThanOrEqual(24);
    }
});

test("slow skill inspection cannot append to a newly active workflow", async ({ page }) => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/skill/**", async (route) => { await pending; await route.fulfill({ json: definition }); });
    await openEditor(page);
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    await page.keyboard.press("Control+n");
    await expect(page.getByRole("tablist", { name: "Workflow tabs" }).getByRole("tab")).toHaveCount(2);
    release();
    await expect(page.locator(".skill-add-feedback")).toContainText("workflow changed");
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(0);
});

test("creation dialogs trap focus and block underlying editor commands", async ({ page }) => {
    await openEditor(page);
    await page.locator(".react-flow__pane").click({ button: "right", position: { x: 250, y: 220 } });
    await page.locator(".context-menu").getByRole("button", { name: "New Slot", exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    const buttons = dialog.getByRole("button", { name: "Cancel", exact: true });
    await buttons.focus();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Control+n");
    await expect(page.getByRole("tablist", { name: "Workflow tabs" }).getByRole("tab")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
});

test("native file requirements are visible without corrupting the browser workflow", async ({ page }) => {
    await openEditor(page);
    const open = page.locator(".header").getByRole("button", { name: "Open", exact: true });
    await open.click();
    await expect(page.locator('.editor-operation-notice [role="alert"]')).toContainText("Bonsai desktop app");
    await page.getByRole("button", { name: "Dismiss operation feedback", exact: true }).click();
    await expect(open).toBeFocused();
    await expect(page.getByRole("tablist", { name: "Workflow tabs" }).getByRole("tab")).toHaveCount(1);
});

test("context actions skip disabled choices and support arrows, Home, End and Escape", async ({ page }) => {
    await openEditor(page);
    await page.locator(".react-flow__pane").click({ button: "right", position: { x: 650, y: 650 } });
    const menu = page.locator(".context-menu");
    const first = menu.getByRole("button", { name: "New Compound State", exact: true });
    await expect(first).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("button", { name: "New Slot", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(first).toBeFocused();
    await page.keyboard.press("Home");
    await expect(first).toBeFocused();
    const bounds = await menu.boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
});

test("clipboard paste choices are natively modal and cancellation preserves the graph", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    const node = page.locator(".react-flow__node-custom");
    await node.click();
    await node.focus();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    const dialog = page.locator("dialog.skill-paste-choice-overlay[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Control+n");
    await expect(page.getByRole("tablist", { name: "Workflow tabs" }).getByRole("tab")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(node).toHaveCount(1);
});
