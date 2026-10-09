import { test, expect } from "@playwright/test";

const skill = "demo.skills.Work";
const definition = { params: [], events: [{ event: "success" }, { event: "error" }], inSlots: [], outSlots: [] };
let engine;
let requests;
let pageErrors;

test.beforeEach(async ({ page }) => {
    engine = { status: "UNKNOWN", resumeNoop: false, failStop: false, offline: false,
        statusFailure: null, transitionsFailure: null, currentStates: ["Work#1"],
        stateIds: ["Root", "Work#1", "Done"], transitions: ["Work.success", "Work.error"] };
    requests = [];
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === "/api/skills") return route.fulfill({ json: { skills: [skill] } });
        if (path.startsWith("/api/skill/")) return route.fulfill({ json: definition });
        requests.push({ path, method: request.method(), body: request.postData(), headers: request.headers() });
        if (path === "/api/status") {
            if (engine.offline) return route.abort("connectionrefused");
            if (engine.statusFailure) return route.fulfill(engine.statusFailure);
            return route.fulfill({ contentType: "text/plain", body: engine.status });
        }
        if (path === "/api/bonsai/states") return route.fulfill({ json: { ids: engine.currentStates } });
        if (path === "/api/bonsai/all_states") return route.fulfill({ json: { ids: engine.stateIds } });
        if (path === "/api/bonsai/transitions") return route.fulfill(engine.transitionsFailure || { json: { transitions: engine.transitions } });
        if (path === "/api/bonsai/load") return route.fulfill({ json: { success: true, messages: [] } });
        if (path === "/api/bonsai/start") engine.status = "RUNNING";
        else if (path === "/api/bonsai/pause") engine.status = "PAUSED";
        else if (path === "/api/bonsai/resume") { if (!engine.resumeNoop) engine.status = "RUNNING"; }
        else if (path === "/api/bonsai/stop") {
            if (engine.failStop) return route.fulfill({ status: 503, body: "Engine unavailable" });
            engine.status = "INITIALIZED";
        } else if (!["/api/bonsai/fire_event", "/api/bonsai/stop_events"].includes(path)) {
            return route.fulfill({ status: 404, body: `Unexpected API route: ${path}` });
        }
        return route.fulfill({ body: "acknowledged" });
    });
});

test.afterEach(() => {
    expect(pageErrors, "the editor and floating panel must not crash").toEqual([]);
});

const runButton = (page) => page.getByRole("button", { name: "Run", exact: true });
const panel = (page) => page.getByRole("dialog", { name: "Run State Machine", exact: true });
const control = (page, name) => panel(page).getByRole("button", { name, exact: true });
const statusValue = (page, name) => panel(page).locator("dt").filter({ hasText: new RegExp(`^${name}$`) }).locator("+ dd");
const engineStatus = (page) => statusValue(page, "Engine");
const commands = () => requests.filter(({ method }) => method === "POST");
const workflowTabs = (page) => page.getByRole("tablist", { name: "Workflow tabs" }).getByRole("tab");
const configuration = (page) => panel(page).getByLabel("Configuration path", { exact: true });
const eventInput = (page) => panel(page).getByRole("combobox", { name: /^Transition event/ });

async function expectPanelFits(page) {
    const { width, height } = page.viewportSize();
    await expect(async () => {
        const bounds = await panel(page).boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
        for (const name of ["Start", "Pause", "Resume", "Stop", "Close run controls"]) {
            const button = await control(page, name).boundingBox();
            expect(button.y, `${name} must stay reachable`).toBeGreaterThanOrEqual(0);
            expect(button.y + button.height, `${name} must stay reachable`).toBeLessThanOrEqual(height);
        }
        expect(await panel(page).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }).toPass({ timeout: 3000 });
}

async function dragPanel(page, x, y) {
    const heading = panel(page).getByRole("heading", { name: "Run State Machine", exact: true });
    await heading.scrollIntoViewIfNeeded();
    const bounds = await heading.boundingBox();
    await page.mouse.move(bounds.x + 30, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString() || ""), "dragging the title must not select editor text").toBe("");
}

async function addWorkflowNode(page) {
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(1);
}

async function loadNativeSnapshot(page, { status = "INITIALIZED", success = true, messages = [] } = {}) {
    await configuration(page).fill(" /configs/bonsai.xml ");
    // One staging IPC only; the rest of the editor and API stay in browser mode.
    await page.evaluate(({ success, messages }) => {
        window.__runtimeStagingCalls ||= [];
        window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
            window.__runtimeStagingCalls.push({ command, args });
            delete window.__TAURI_INTERNALS__;
            if (command !== "load_runtime_workflow") throw new Error(`Unexpected native command: ${command}`);
            return { status: 200, body: JSON.stringify({ success, messages }), headers: { "content-type": "application/json" } };
        } };
    }, { success, messages });
    engine.status = status;
    await control(page, "Load configuration and state machine").click();
    await expect(panel(page).getByRole("status").filter({ hasText: success
        ? /^Configuration and state machine loaded\.$/ : /^Load completed with reported issues\./ })).toBeVisible();
    await expect(panel(page)).toHaveAttribute("aria-busy", "false");
    const calls = await page.evaluate(() => window.__runtimeStagingCalls);
    expect(calls.every(({ command }) => command === "load_runtime_workflow")).toBe(true);
    expect(await page.evaluate(() => window.__TAURI_INTERNALS__ === undefined)).toBe(true);
    return calls.at(-1).args;
}

for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844], ["short viewport", 640, 360]]) {
    test(`Run opens a nonmodal, bounded draggable panel and restores focus on ${name}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto("/");
        const run = runButton(page);
        const log = page.getByRole("button", { name: "Load log", exact: true });
        await expect(run).toBeVisible(); await expect(log).toBeVisible();
        const runBounds = await run.boundingBox(); const logBounds = await log.boundingBox();
        expect(runBounds.x + runBounds.width).toBeLessThanOrEqual(logBounds.x);
        await expect(run).toHaveAttribute("aria-haspopup", "dialog");
        await run.focus(); await page.keyboard.press("Enter");
        const dialog = panel(page);
        await expect(dialog).toBeVisible(); await expect(dialog).toHaveAttribute("aria-modal", "false");
        await expect(dialog).toHaveClass(/runtime-commander-dialog/);
        await expect(page.locator('dialog[open], [aria-modal="true"]')).toHaveCount(0);
        await expect(configuration(page)).toBeFocused();
        await expect(engineStatus(page)).toHaveText("Not initialized");
        await expect(control(page, "Start")).toBeDisabled();
        await expect(control(page, "Load configuration and state machine")).toBeDisabled();
        await expectPanelFits(page);
        expect(await page.locator(".react-flow").evaluate((element) => element.closest("[inert]") === null)).toBe(true);
        await control(page, "Refresh status").focus(); await page.keyboard.press("Tab");
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(false);
        await page.keyboard.press("Shift+Tab"); await expect(control(page, "Refresh status")).toBeFocused();
        await dragPanel(page, 0, 0); await expectPanelFits(page);
        const upper = await dialog.boundingBox();
        expect(upper.x).toBe(8); expect(upper.y).toBe(8);
        await dragPanel(page, width - 1, height - 1); await expectPanelFits(page);
        const lower = await dialog.boundingBox();
        expect(lower.x + lower.width).toBe(width - 8); expect(lower.y).toBeGreaterThan(upper.y);
        await control(page, "Minimize run controls").click(); await expectPanelFits(page);
        await expect(configuration(page)).toBeHidden();
        for (const name of ["Start", "Pause", "Resume", "Stop"]) await expect(control(page, name)).toBeVisible();
        await control(page, "Expand run controls").click(); await expectPanelFits(page);
        await control(page, "Close run controls").focus();
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(run).toBeFocused();
        expect(commands()).toEqual([]);
        expect(requests.some(({ path }) => path === "/api/bonsai/status")).toBe(false);
    });
}

test("keys scoped inside the floating panel leave the selected workflow and graph intact", async ({ page }) => {
    await page.goto("/");
    await addWorkflowNode(page);
    const node = page.locator(".react-flow__node-custom");
    await expect(node).toHaveCount(1); await node.click();
    const tabs = page.getByRole("tablist", { name: "Workflow tabs" });
    await page.keyboard.press("Control+n");
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await tabs.getByRole("tab").first().click();
    await expect(node).toHaveCount(1); await node.click();
    const selected = await tabs.getByRole("tab", { selected: true }).textContent();
    await runButton(page).click(); await expect(panel(page)).toBeVisible();
    for (const shortcut of ["Control+n", "Meta+n", "Control+s", "Meta+s", "Control+o", "Meta+o",
        "Control+Tab", "Control+Shift+Tab", "Meta+Tab", "Meta+Shift+Tab", "Delete", "Backspace",
        "Control+z", "Control+y", "Control+Shift+z", "Meta+z", "Meta+Shift+z", "Control+f", "Meta+f", "Control+c", "Control+x", "Control+v"]) {
        await control(page, "Close run controls").focus();
        await page.keyboard.press(shortcut);
        await expect(node, `${shortcut} must not modify the graph outside the panel`).toHaveCount(1);
        await expect(tabs.getByRole("tab"), `${shortcut} must not create workflows`).toHaveCount(2);
        await expect(tabs.getByRole("tab", { selected: true }), `${shortcut} must not switch workflows`).toHaveText(selected);
        await expect(page.locator(".ui-toast, .editor-operation-notice, .editor-find-overlay"), `${shortcut} must not invoke editor actions`).toHaveCount(0);
    }
    await configuration(page).fill("/configs/bonsai.xml");
    await configuration(page).press("End"); await configuration(page).press("Backspace");
    await expect(configuration(page)).toHaveValue("/configs/bonsai.xm");
    for (const shortcut of ["Control+n", "Control+s", "Control+Tab", "Control+f"]) {
        await configuration(page).focus(); await page.keyboard.press(shortcut);
        await expect(tabs.getByRole("tab")).toHaveCount(2);
        await expect(tabs.getByRole("tab", { selected: true })).toHaveText(selected);
        await expect(page.locator(".editor-operation-notice, .editor-find-overlay")).toHaveCount(0);
    }
    await expect(panel(page)).toBeVisible(); await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { selected: true })).toHaveText(selected);
    await expect(node).toHaveCount(1); await expect(page.locator(".ui-toast, .editor-operation-notice, .editor-find-overlay")).toHaveCount(0);
    expect(commands()).toEqual([]);
    await page.keyboard.press("Escape"); await expect(panel(page)).toHaveCount(0); await expect(runButton(page)).toBeFocused();
});

test("canvas and workflow shortcuts remain interactive outside the floating panel", async ({ page }) => {
    await page.goto("/"); await addWorkflowNode(page);
    await page.keyboard.press("Control+n"); await expect(workflowTabs(page)).toHaveCount(2);
    await workflowTabs(page).first().click();
    await runButton(page).click();
    await workflowTabs(page).first().focus(); await page.keyboard.press("Control+Tab");
    await expect(workflowTabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await workflowTabs(page).nth(1).focus(); await page.keyboard.press("Control+Shift+Tab");
    await expect(workflowTabs(page).first()).toHaveAttribute("aria-selected", "true");
    const node = page.locator(".react-flow__node-custom");
    await node.click(); await node.focus(); await page.keyboard.press("Delete"); await expect(node).toHaveCount(0);
    await page.locator("#workflow-tab-panel").focus(); await page.keyboard.press("Control+z"); await expect(node).toHaveCount(1);
    await page.keyboard.press("Control+y"); await expect(node).toHaveCount(0);
    await page.keyboard.press("Control+z"); await expect(node).toHaveCount(1);
    await page.locator("#workflow-tab-panel").focus(); await page.keyboard.press("Control+f");
    await expect(page.locator(".editor-find-overlay")).toBeVisible(); await page.keyboard.press("Escape");
    await expect(page.locator(".editor-find-overlay")).toHaveCount(0); await expect(panel(page)).toBeVisible();
    await page.locator("#workflow-tab-panel").focus();
    await page.keyboard.press("Control+n"); await expect(workflowTabs(page)).toHaveCount(3);
    await expect(panel(page)).toBeVisible();
    await workflowTabs(page).last().focus(); await page.keyboard.press("Escape");
    await expect(panel(page)).toBeVisible(); await expect(workflowTabs(page).last()).toBeFocused();
    // An unfocused close must not steal focus back from the editor.
    await control(page, "Close run controls").dispatchEvent("click");
    await expect(panel(page)).toHaveCount(0); await expect(workflowTabs(page).last()).toBeFocused();
    expect(commands()).toEqual([]);
});

test("dragged panels stay bounded when resized between desktop, mobile and short viewports", async ({ page }) => {
    await page.goto("/"); await runButton(page).click();
    await dragPanel(page, 1439, 899); await expectPanelFits(page);
    for (const viewport of [{ width: 390, height: 844 }, { width: 640, height: 360 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport); await expectPanelFits(page);
        await expect(control(page, "Minimize run controls")).toBeVisible();
        await expect(control(page, "Close run controls")).toBeVisible();
    }
    await control(page, "Close run controls").click(); await expect(runButton(page)).toBeFocused();
    await page.setViewportSize({ width: 390, height: 360 });
    await runButton(page).click(); await expectPanelFits(page);
    await control(page, "Close run controls").click(); await expect(runButton(page)).toBeFocused();
    expect(commands()).toEqual([]);
});

test("minimization preserves the execution toolbar, actual status and expanded fields", async ({ page }) => {
    engine.status = "RUNNING";
    await page.goto("/"); await runButton(page).click(); await expect(engineStatus(page)).toHaveText("Running");
    await configuration(page).fill("/configs/bonsai.xml");
    const expanded = await panel(page).boundingBox();
    await control(page, "Minimize run controls").click();
    await expect(configuration(page)).toBeHidden(); await expect(control(page, "Refresh status")).toBeHidden();
    for (const name of ["Start", "Pause", "Resume", "Stop"]) await expect(control(page, name)).toBeVisible();
    expect((await panel(page).boundingBox()).height).toBeLessThan(expanded.height);
    await expect(control(page, "Start")).toBeDisabled(); await expect(control(page, "Pause")).toBeEnabled();
    await control(page, "Pause").click(); await expect(panel(page).getByRole("status")).toHaveText("Paused");
    await expect(control(page, "Pause")).toBeDisabled(); await expect(control(page, "Resume")).toBeEnabled();
    await control(page, "Resume").click(); await expect(panel(page).getByRole("status")).toHaveText("Running");
    await control(page, "Stop").click(); await expect(panel(page).getByRole("status")).toHaveText("Ready");
    await control(page, "Close run controls").click(); await expect(panel(page)).toHaveCount(0);
    await runButton(page).click(); await expect(control(page, "Expand run controls")).toBeVisible();
    await expect(panel(page)).toBeFocused();
    await control(page, "Expand run controls").click();
    await expect(configuration(page)).toHaveValue("/configs/bonsai.xml"); await expect(engineStatus(page)).toHaveText("Ready");
    expect(commands().map(({ path }) => path)).toEqual(["/api/bonsai/pause", "/api/bonsai/resume", "/api/bonsai/stop"]);
});

test("available events are suggestions, manual events stay raw, and automatic-event requests stay scalar", async ({ page }) => {
    engine.status = "RUNNING";
    await page.goto("/"); await runButton(page).click();
    await expect(engineStatus(page)).toHaveText("Running");
    await expect(control(page, "Start")).toBeDisabled();
    await expect(control(page, "Pause")).toBeEnabled();
    await control(page, "Pause").click(); await expect(engineStatus(page)).toHaveText("Paused");
    engine.resumeNoop = true;
    await control(page, "Resume").click();
    await expect(panel(page).getByRole("status").filter({ hasText: /^Resume acknowledged by the engine\.$/ })).toBeVisible();
    await expect(engineStatus(page)).toHaveText("Paused");
    await expect(control(page, "Resume")).toBeEnabled();
    engine.resumeNoop = false;
    await control(page, "Resume").click(); await expect(engineStatus(page)).toHaveText("Running");
    await expect(panel(page).locator("datalist option")).toHaveCount(2);
    const beforeSelection = commands().length;
    await control(page, "Work.success").click(); await expect(eventInput(page)).toHaveValue("Work.success");
    expect(commands()).toHaveLength(beforeSelection);
    await eventInput(page).fill(" Work.success ");
    await control(page, "Send event").click();
    await expect(panel(page).getByRole("status").filter({ hasText: /^Event sent: Work.success$/ })).toBeVisible();
    const event = commands().find(({ path }) => path === "/api/bonsai/fire_event");
    expect(event.body).toBe("Work.success"); expect(event.headers["content-type"]).toBe("application/json");
    await eventInput(page).fill(" Manual.external#1 "); await eventInput(page).press("Enter");
    await expect(panel(page).getByRole("status").filter({ hasText: /^Event sent: Manual.external#1$/ })).toBeVisible();
    expect(commands().filter(({ path }) => path === "/api/bonsai/fire_event").map(({ body }) => body)).toEqual(["Work.success", "Manual.external#1"]);
    engine.transitions = ["Work.retry"];
    await control(page, "Refresh status").click();
    await expect(control(page, "Work.success")).toHaveCount(0); await expect(control(page, "Work.retry")).toBeVisible();
    await expect(eventInput(page)).toHaveValue(" Manual.external#1 ");
    await control(page, "Enable automatic events").click();
    await expect(control(page, "Enable automatic events")).toHaveAttribute("aria-pressed", "true");
    await control(page, "Disable automatic events").click();
    await expect(control(page, "Disable automatic events")).toHaveAttribute("aria-pressed", "true");
    expect(commands().filter(({ path }) => path === "/api/bonsai/stop_events").map(({ body }) => body)).toEqual(["true", "false"]);
    for (const request of commands().filter(({ path }) => path === "/api/bonsai/stop_events")) expect(request.headers["content-type"]).toBe("application/json");
    await control(page, "Stop").click(); await expect(engineStatus(page)).toHaveText("Ready");
    await expect(control(page, "Pause")).toBeDisabled(); await expect(control(page, "Resume")).toBeDisabled();
    await expect(panel(page).locator("datalist option")).toHaveCount(1);
    engine.failStop = true;
    await control(page, "Stop").click();
    await expect(panel(page).getByRole("alert")).toContainText("HTTP 503 - Engine unavailable");
    await expect(panel(page).getByRole("alert")).toContainText("Refresh status before retrying");
    await expect(engineStatus(page)).toHaveText("Ready");
    const beforeClose = commands().length;
    await control(page, "Close run controls").click(); await expect(panel(page)).toHaveCount(0);
    expect(commands()).toHaveLength(beforeClose);
    expect(requests.some(({ path }) => path === "/api/bonsai/status")).toBe(false);
});

test("configuration path is cached across close, workflow switches and browser reload", async ({ page }) => {
    await page.goto("/"); await runButton(page).click();
    await configuration(page).fill("/configs/cached bonsai.xml");
    await control(page, "Close run controls").click();
    await page.keyboard.press("Control+n"); await expect(workflowTabs(page)).toHaveCount(2);
    await runButton(page).click(); await expect(configuration(page)).toHaveValue("/configs/cached bonsai.xml");
    await page.reload(); await runButton(page).click();
    await expect(configuration(page)).toHaveValue("/configs/cached bonsai.xml");
    await expect(control(page, "Load configuration and state machine")).toBeEnabled();
    expect(commands()).toEqual([]);
});

test("browser-local unsaved workflow requires native snapshot staging, not saving or an arbitrary task path", async ({ page }) => {
    await page.goto("/");
    await addWorkflowNode(page);
    await runButton(page).click();
    await expect(panel(page).getByText("Not saved to a local file yet", { exact: true })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Browse", exact: true })).toHaveCount(0);
    await configuration(page).fill("/configs/bonsai.xml");
    await control(page, "Load configuration and state machine").click();
    await expect(panel(page).getByRole("alert")).toContainText("Running an unsaved workflow requires the Bonsai desktop app's native SCXML serializer.");
    await expect(panel(page).getByRole("alert")).toContainText("No save is required in the desktop app.");
    await expect(control(page, "Start")).toBeDisabled();
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(1);
    await expect(page.getByRole("tablist", { name: "Workflow tabs" }).getByRole("tab")).toHaveCount(1);
    expect(commands()).toEqual([]);
});

test("an unavailable backend disables engine commands and recovers without sending requests", async ({ page }) => {
    engine.offline = true;
    await page.goto("/"); await runButton(page).click();
    await expect(panel(page).getByRole("alert")).toContainText("Could not get engine status.");
    await expect(panel(page).getByRole("alert")).toContainText("Check that WebCommander is running on localhost:8080.");
    await expect(engineStatus(page)).toHaveText("Not connected");
    await eventInput(page).fill("Work.success");
    for (const name of ["Start", "Pause", "Resume", "Stop", "Send event", "Enable automatic events", "Disable automatic events"]) {
        await expect(control(page, name)).toBeDisabled();
    }
    engine.offline = false; engine.status = "RUNNING";
    await control(page, "Refresh status").click(); await expect(engineStatus(page)).toHaveText("Running");
    await expect(panel(page).getByRole("alert")).toHaveCount(0); await expect(control(page, "Pause")).toBeEnabled();
    expect(commands()).toEqual([]);
});

test("HTTP status failure labels the last snapshot stale and cannot enable commands", async ({ page }) => {
    engine.status = "RUNNING";
    await page.goto("/"); await runButton(page).click(); await expect(engineStatus(page)).toHaveText("Running");
    engine.statusFailure = { status: 503, body: "Engine unavailable" };
    await control(page, "Refresh status").click();
    await expect(panel(page).getByRole("alert")).toContainText("WebCommander status: HTTP 503 - Engine unavailable");
    await expect(panel(page).getByRole("alert")).toContainText("Showing the last successful status below; it may be stale.");
    await expect(engineStatus(page)).toHaveText("Running");
    for (const name of ["Start", "Pause", "Resume", "Stop"]) await expect(control(page, name)).toBeDisabled();
    engine.statusFailure = null; engine.status = "PAUSED";
    await control(page, "Refresh status").click(); await expect(engineStatus(page)).toHaveText("Paused");
    await expect(control(page, "Resume")).toBeEnabled(); await expect(panel(page).getByRole("alert")).toHaveCount(0);
    expect(commands()).toEqual([]);
    expect(requests.filter(({ path }) => path === "/api/status").every(({ method }) => method === "GET")).toBe(true);
    expect(requests.some(({ path }) => path === "/api/bonsai/status")).toBe(false);
});

test("unavailable state details are warnings, not empty event lists or a fabricated engine failure", async ({ page }) => {
    engine.status = "RUNNING"; engine.transitionsFailure = { status: 502, body: "Transitions unavailable" };
    await page.goto("/"); await runButton(page).click();
    await expect(engineStatus(page)).toHaveText("Running");
    await expect(panel(page).getByRole("status").filter({ hasText: /Engine status is available, but state\/transition details could not be read/ })).toContainText("HTTP 502 - Transitions unavailable");
    await expect(panel(page).getByRole("alert")).toHaveCount(0);
    await expect(statusValue(page, "Active states")).toHaveText("Unavailable");
    await expect(statusValue(page, "State count")).toHaveText("Unknown");
    await expect(statusValue(page, "Transition events")).toHaveText("Unavailable");
    await expect(panel(page).getByText("Unavailable. Refresh status to try again.", { exact: true })).toBeVisible();
    await expect(control(page, "Pause")).toBeEnabled();
    engine.transitionsFailure = null; engine.transitions = [];
    await control(page, "Refresh status").click();
    await expect(statusValue(page, "Transition events")).toHaveText("None reported");
    await expect(panel(page).getByText("None reported by the engine.", { exact: true })).toBeVisible();
    await expect(panel(page).getByText("Unavailable. Refresh status to try again.", { exact: true })).toHaveCount(0);
    await expect(panel(page).locator("datalist option")).toHaveCount(0);
    expect(commands()).toEqual([]);
});

test("native staging preserves unsaved content and separates faults from readiness-aware Start", async ({ page }) => {
    await page.goto("/"); await addWorkflowNode(page);
    const selected = await workflowTabs(page).first().textContent();
    const dirty = workflowTabs(page).first().getByRole("img", { name: "Unsaved changes", exact: true });
    await expect(dirty).toBeVisible();
    await runButton(page).click();
    const warning = "State with id 'Work' has only conditional transitions for event 'Work.success'";
    const error = "State with id 'Work' misses transition for event 'Work.error'";
    const diagnostic = "Optional adapter unavailable";
    const args = await loadNativeSnapshot(page, { status: "INITIALIZED_BUT_WARNINGS", success: false,
        messages: [warning, error, diagnostic] });
    expect(args).toMatchObject({ pathToConfig: "/configs/bonsai.xml", currentFilePath: null, includeMapping: {}, forceConfigure: false });
    expect(args.request.nodes).toHaveLength(1);
    expect(args.request.nodes[0]).toMatchObject({ nodeType: "custom", fullSkillName: "Work#1" });
    expect(args.request.edges).toEqual([]);
    await expect(workflowTabs(page).first()).toHaveText(selected); await expect(dirty).toBeVisible();
    await expect(panel(page).getByText("Not saved to a local file yet", { exact: true })).toBeVisible();
    await expect(engineStatus(page)).toHaveText("Ready with warnings"); await expect(control(page, "Start")).toBeEnabled();
    await expect(panel(page).getByRole("status").filter({ hasText: warning })).toHaveClass(/ui-inline-feedback--warning/);
    await expect(panel(page).getByRole("alert").filter({ hasText: error })).toHaveClass(/ui-inline-feedback--danger/);
    await expect(panel(page).getByRole("status").filter({ hasText: /The load reported issues, but the engine is initialized/ })).toBeVisible();
    await expect(panel(page).getByText(diagnostic, { exact: true })).toBeVisible();
    await expect(panel(page).getByText("The server did not provide severity for these messages.", { exact: true })).toBeVisible();
    expect(commands()).toEqual([]);
    await page.getByRole("button", { name: `Add ${skill} to canvas`, exact: true }).click();
    await expect(page.locator(".react-flow__node-custom")).toHaveCount(2);
    await expect(control(page, "Start")).toBeDisabled();
    await expect(panel(page).getByRole("status").filter({ hasText: /The open workflow differs from the loaded version/ })).toBeVisible();
    await expect(dirty).toBeVisible();
    const updated = await loadNativeSnapshot(page);
    expect(updated.request.nodes).toHaveLength(2); await expect(control(page, "Start")).toBeEnabled();
    await expect(panel(page).getByRole("status").filter({ hasText: /The open workflow differs from the loaded version/ })).toHaveCount(0);
    expect((await page.evaluate(() => window.__runtimeStagingCalls)).map(({ command }) => command)).toEqual(["load_runtime_workflow", "load_runtime_workflow"]);
    expect(commands()).toEqual([]);
});

for (const [status, label, success] of [["UNKNOWN", "Not initialized", true], ["LOADING", "Loading", false]]) {
    test(`a staged ${success ? "successful" : "unsuccessful"} load keeps Start disabled while the engine is ${status}`, async ({ page }) => {
        await page.goto("/"); await addWorkflowNode(page); await runButton(page).click();
        await loadNativeSnapshot(page, { status, success });
        await expect(engineStatus(page)).toHaveText(label); await expect(control(page, "Start")).toBeDisabled();
        if (!success) await expect(panel(page).getByRole("alert")).toContainText("The load reported issues and the engine is not ready.");
        engine.status = "INITIALIZED_BUT_WARNINGS";
        await control(page, "Refresh status").click();
        await expect(engineStatus(page)).toHaveText("Ready with warnings"); await expect(control(page, "Start")).toBeEnabled();
        if (!success) await expect(panel(page).getByRole("status").filter({ hasText: /The load reported issues, but the engine is initialized/ })).toBeVisible();
        await expect(workflowTabs(page).first().getByRole("img", { name: "Unsaved changes", exact: true })).toBeVisible();
        expect(commands()).toEqual([]);
    });
}

test("live execution paints and follows the staged graph through minimize, pause, background close and stop", async ({ page }) => {
    await page.goto("/"); await addWorkflowNode(page);
    const node = page.locator(".react-flow__node-custom");
    const nodeId = await node.getAttribute("data-id");
    await node.click();
    const target = page.locator(".exit-token-success").getByRole("combobox", { name: "Target", exact: true });
    await target.click(); await page.locator(".exit-token-success").getByRole("option").first().click();
    const edge = page.locator(".react-flow__edge");
    await expect(edge).toHaveCount(1);
    const edgeId = await edge.getAttribute("data-id");
    const dirty = workflowTabs(page).first().getByRole("img", { name: "Unsaved changes", exact: true });
    await runButton(page).click();
    const args = await loadNativeSnapshot(page);
    const state = args.request.nodes[0].fullSkillName.replace(/^.*\./, "");
    engine.currentStates = [state]; engine.stateIds = [state];
    const follow = panel(page).getByRole("checkbox", { name: "Follow active states in the node editor", exact: true });
    await expect(follow).toBeChecked();
    const viewport = page.locator(".react-flow__viewport");
    await page.locator(".react-flow__controls-zoomout").click();
    const beforeStart = await viewport.getAttribute("style");
    await control(page, "Minimize run controls").click(); await expect(control(page, "Start")).toBeEnabled();
    await control(page, "Start").click(); await expect(panel(page).getByRole("status")).toHaveText("Running");
    await expect(node).toHaveClass(/runtime-log-target-node/);
    await expect(viewport).not.toHaveAttribute("style", beforeStart);
    await expect.poll(() => viewport.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(1.15, 2);
    await expect(edge).not.toHaveClass(/runtime-log-active-edge/);
    await control(page, "Expand run controls").click();
    const beforeSelection = commands().length;
    await control(page, "Work.success").click(); await expect(eventInput(page)).toHaveValue("Work.success");
    expect(commands()).toHaveLength(beforeSelection);
    await control(page, "Send event").click();
    await expect(panel(page).getByRole("status").filter({ hasText: /^Event sent: Work.success$/ })).toBeVisible();
    await expect(edge).not.toHaveClass(/runtime-log-active-edge/);
    await control(page, "Minimize run controls").click();
    await expect(node).toHaveAttribute("data-id", nodeId); await expect(dirty).toBeVisible();
    await control(page, "Pause").click(); await expect(panel(page).getByRole("status")).toHaveText("Paused");
    await expect(node).toHaveClass(/runtime-log-target-node/); await expect(control(page, "Resume")).toBeEnabled();
    await control(page, "Resume").click(); await expect(panel(page).getByRole("status")).toHaveText("Running");
    await control(page, "Expand run controls").click(); await follow.uncheck();
    await expect(node).toHaveClass(/runtime-log-target-node/);
    const canvas = await page.locator(".react-flow__pane").boundingBox();
    await page.mouse.move(canvas.x + 60, canvas.y + 200); await page.mouse.down({ button: "middle" });
    await page.mouse.move(canvas.x + 180, canvas.y + 260, { steps: 8 }); await page.mouse.up({ button: "middle" });
    const unfollowed = await viewport.getAttribute("style");
    const beforeClose = commands().length;
    await control(page, "Close run controls").click(); await expect(panel(page)).toHaveCount(0);
    await expect(node).toHaveClass(/runtime-log-target-node/); expect(commands()).toHaveLength(beforeClose);
    engine.currentStates = ["Unmapped#1"];
    await expect(node).not.toHaveClass(/runtime-log-target-node/);
    engine.currentStates = [state]; await expect(node).toHaveClass(/runtime-log-target-node/);
    await expect(viewport).toHaveAttribute("style", unfollowed);
    await runButton(page).click(); await expect(engineStatus(page)).toHaveText("Running"); await expect(follow).not.toBeChecked();
    await control(page, "Stop").click(); await expect(engineStatus(page)).toHaveText("Ready");
    await expect(node).not.toHaveClass(/runtime-log-target-node/);
    await expect(page.locator(".react-flow.runtime-log-focus-mode")).toHaveCount(0);
    await expect(node).toHaveAttribute("data-id", nodeId); await expect(dirty).toBeVisible();
    await expect(edge).toHaveAttribute("data-id", edgeId); await expect(edge).not.toHaveClass(/runtime-log-active-edge/);
    expect(commands().map(({ path }) => path)).toEqual(["/api/bonsai/start", "/api/bonsai/fire_event", "/api/bonsai/pause", "/api/bonsai/resume", "/api/bonsai/stop"]);
    expect((await page.evaluate(() => window.__runtimeStagingCalls)).map(({ command }) => command)).toEqual(["load_runtime_workflow"]);
});
