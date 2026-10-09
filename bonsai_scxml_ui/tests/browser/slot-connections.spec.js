import { test, expect } from "@playwright/test";

const skill = "demo.skills.Work";
const definition = { params: [], events: [{ event: "done" }],
    inSlots: [{ key: "input", type: "String" }], outSlots: [{ key: "output", type: "String" }] };

test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", (route) => route.fulfill({ json:
        new URL(route.request().url()).pathname === "/api/skills" ? { skills: [skill] } : definition }));
    await page.goto("/");
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(1);
});

async function startDrag(page, handle) {
    const bounds = await handle.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
}
async function emptyPoint(page, fraction = 0.75) {
    const bounds = await page.locator(".react-flow__pane").boundingBox();
    return { x: bounds.x + bounds.width * fraction, y: bounds.y + bounds.height * 0.8 };
}
async function moveTo(page, handle) {
    const bounds = await handle.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 10 });
}

test("read and write empty drops show a transient preview and create connected typed slots", async ({ page }) => {
    await expect(page.locator(".canvas-controls").getByRole("button", { name: /New Slot/i })).toHaveCount(0);
    for (const [access, fraction] of [["read", 0.75], ["write", 0.35]]) {
        const before = await page.locator(".react-flow__node-slot").count();
        await startDrag(page, page.locator(`.react-flow__node-custom .slot-skill-${access}-handle`));
        const point = await emptyPoint(page, fraction);
        await page.mouse.move(point.x, point.y, { steps: 12 });
        await expect(page.locator(".slot-connection-preview")).toBeVisible();
        await expect(page.locator(".slot-connection-preview-type")).toContainText("String");
        await expect(page.locator(".react-flow__node-slot")).toHaveCount(before);
        await page.mouse.up();
        await expect(page.locator(".slot-connection-preview")).toHaveCount(0);
        await expect(page.locator(".react-flow__node-slot")).toHaveCount(before + 1);
        await expect(page.locator(`.react-flow__edge[data-id^="edge-slot-${access}-"]`)).toHaveCount(1);
    }
});

test("a slot-origin read drag connects an existing slot to a second skill without creating a default", async ({ page }) => {
    await startDrag(page, page.locator(".react-flow__node-custom .slot-skill-read-handle"));
    const point = await emptyPoint(page);
    await page.mouse.move(point.x, point.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator(".react-flow__node-slot")).toHaveCount(1);
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(2);
    const target = page.locator(".react-flow__node-custom").last().locator(".slot-skill-read-handle");
    await startDrag(page, page.locator(".slot-node-read-handle"));
    await moveTo(page, target);
    await page.mouse.up();
    await expect(page.locator('.react-flow__edge[data-id^="edge-slot-read-"]')).toHaveCount(2);
    await expect(page.locator(".react-flow__node-slot")).toHaveCount(1);
    await expect(page.locator(".slot-connection-preview")).toHaveCount(0);
});

test("default slot previews and their created nodes stay at the cursor after zooming and panning", async ({ page }) => {
    const pane = page.locator(".react-flow__pane");
    const viewport = page.locator(".react-flow__viewport");
    await page.locator(".react-flow__controls-zoomout").click();
    await expect.poll(() => viewport.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeLessThan(0.95);
    const bounds = await pane.boundingBox();
    await page.mouse.move(bounds.x + 70, bounds.y + 70);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(bounds.x + 190, bounds.y + 130, { steps: 12 });
    await page.mouse.up({ button: "middle" });

    const handle = page.locator(".react-flow__node-custom .slot-skill-read-handle");
    await startDrag(page, handle);
    const point = await emptyPoint(page, 0.65);
    await page.mouse.move(point.x, point.y, { steps: 12 });
    const preview = page.locator(".slot-connection-preview");
    await expect(preview).toBeVisible();
    await expect.poll(async () => {
        const box = await preview.boundingBox();
        return Math.max(Math.abs(box.x - point.x), Math.abs(box.y - point.y));
    }).toBeLessThan(2);
    await page.mouse.up();
    const slot = page.locator(".react-flow__node-slot");
    await expect(slot).toHaveCount(1);
    await expect.poll(async () => {
        const box = await slot.boundingBox();
        return Math.max(Math.abs(box.x - point.x), Math.abs(box.y - point.y));
    }).toBeLessThan(2);
});

test("Escape and invalid target releases leave slot declarations and the graph untouched", async ({ page }) => {
    const handle = page.locator(".react-flow__node-custom .slot-skill-read-handle");
    await startDrag(page, handle);
    const point = await emptyPoint(page);
    await page.mouse.move(point.x, point.y, { steps: 12 });
    await expect(page.locator(".slot-connection-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".slot-connection-preview")).toHaveCount(0);
    await expect(page.locator(".react-flow__node-slot")).toHaveCount(0);
    await startDrag(page, handle);
    await moveTo(page, page.locator(".react-flow__node-custom .slot-skill-write-handle"));
    await page.mouse.up();
    await expect(page.locator(".react-flow__node-slot")).toHaveCount(0);
    await expect(page.locator('.react-flow__edge[data-id^="edge-slot-"]')).toHaveCount(0);
});

test("overview INITIAL badges fit inside skill headers while all hit areas remain enlarged", async ({ page }) => {
    const node = page.locator(".react-flow__node-custom");
    await node.click();
    await page.locator(".initial-button").click();
    const badge = node.locator(".initial-state-badge-inline");
    await expect(badge).toBeVisible();
    const card = await node.boundingBox();
    const bounds = await badge.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(card.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(card.x + card.width);
    expect(bounds.y).toBeGreaterThanOrEqual(card.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(card.y + card.height);
    expect(await node.locator(".custom-node-label").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
