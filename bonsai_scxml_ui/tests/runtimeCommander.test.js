import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { act, createElement, StrictMode, useLayoutEffect, useState } from "react";
import { Window } from "happy-dom";
import { classifyWebCommanderMessages, getWebCommanderSnapshot, loadWebCommander, requestWebCommander } from "../src/utils/webCommander.js";
import { buildRustEditorExportRequest } from "../src/utils/scxmlRustExport.js";

const window = new Window({ url: "http://localhost/" });
const document = window.document;
const originals = new Map();
const noop = () => {};
let server;
let createRoot;
let RuntimeCommander;
let FeedbackProvider;
let hooks;
let root;
let container;
let opener;
let mounted;
let current;
let calls;
let nativeCalls;
let native;
let engine;
let respond;
let intervals;
let nextInterval;
let closes;
let startOpen;
let executionUpdates;

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const workflow = (id = "current") => ({
    id, title: id, fileName: `${id}.xml`, filePath: `/workflows/${id}.xml`,
    nodes: [{ id: "work", type: "custom", position: { x: 40, y: 50 },
        data: { label: "Work", fullSkillName: "pkg.Work", params: [{ key: "count", expr: "1" }] } }],
    edges: [], slotNodes: [], slotEdges: [], manualSlots: [], globalDataModel: [], inheritedGlobalDataModel: [],
});
const directories = [
    { key: " BEH ", path: " /behaviors " }, { key: "OTHER", path: "/other" },
    { key: "", path: "/ignored" }, { key: "EMPTY", path: " " },
];

function engineResponse(call) {
    if (call.url === "/api/status") return new Response(engine.status);
    const endpoint = call.url.replace("/api/bonsai/", "");
    if (call.method === "GET") {
        if (endpoint === "states") return json({ ids: engine.currentStates });
        if (endpoint === "all_states") return json({ ids: engine.stateIds });
        if (endpoint === "transitions") return json({ transitions: engine.transitions });
    }
    if (endpoint === "load") {
        engine.status = "INITIALIZED_BUT_WARNINGS";
        return json({ success: true, messages: ["Configuration loaded", "Optional adapter unavailable"] });
    }
    const status = { start: "RUNNING", pause: "PAUSED", resume: "RUNNING", stop: "INITIALIZED" }[endpoint];
    if (status) engine.status = status;
    assert.ok(["start", "pause", "resume", "stop", "fire_event", "stop_events"].includes(endpoint), call.url);
    return new Response("acknowledged");
}

function Harness() {
    const graph = hooks.useEditorGraphState();
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [isOpen, setIsOpen] = useState(startOpen);
    const tabs = hooks.useWorkflowTabs({ ...graph, selectedNodeId, setSelectedNodeId,
        fitView: noop, getViewport: noop, setViewport: noop, syncRustDocument: async () => null });
    useLayoutEffect(() => { current = { graph, tabs, setIsOpen }; }, [graph, tabs]);
    return createElement(RuntimeCommander, {
        isOpen, onClose: () => { closes.push(true); setIsOpen(false); }, workflowTab: tabs.activeTab,
        workflowFingerprint: tabs.activeFingerprint,
        getTabSnapshot: tabs.getTabSnapshot, getTabsSnapshot: tabs.getTabsSnapshot,
        getActiveDocumentIdentity: tabs.getActiveDocumentIdentity,
        behaviorDirectories: directories,
        onExecutionUpdate: (update) => executionUpdates.push(update),
    });
}

test.before(async () => {
    for (const [name, value] of Object.entries({
        window, document, navigator: window.navigator, HTMLElement: window.HTMLElement,
        HTMLInputElement: window.HTMLInputElement, Element: window.Element, Node: window.Node,
        requestAnimationFrame: window.requestAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    originals.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"));
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    ({ createRoot } = await import("react-dom/client"));
    const { createServer } = await import("vite");
    server = await createServer({ configFile: false, appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] } });
    hooks = Object.assign({}, ...await Promise.all([
        "graph/useEditorGraphState", "document/useWorkflowTabs",
    ].map((name) => server.ssrLoadModule(`/src/hooks/${name}.js`))));
    ({ default: RuntimeCommander } = await server.ssrLoadModule("/src/components/overlays/RuntimeCommander.jsx"));
    ({ FeedbackProvider } = await server.ssrLoadModule("/src/components/ui/index.js"));
});
test.beforeEach(() => {
    calls = []; nativeCalls = []; closes = []; mounted = false; startOpen = true;
    executionUpdates = [];
    window.localStorage.clear();
    engine = { status: "UNKNOWN", currentStates: ["Work#1"], stateIds: ["Root", "Work#1", "Done"],
        transitions: ["Work.success", "Work.error"] };
    respond = engineResponse;
    globalThis.fetch = async (url, init) => {
        const call = { url, ...init }; calls.push(call);
        if (call.signal?.aborted) throw call.signal.reason;
        return respond(call);
    };
    intervals = new Map(); nextInterval = 0;
    window.setInterval = (callback, milliseconds) => {
        const id = ++nextInterval; intervals.set(id, { callback, milliseconds }); return id;
    };
    window.clearInterval = (id) => intervals.delete(id);
    native = {
        open: () => null,
        load: async () => {
            const response = await respond({ url: "/api/bonsai/load", method: "POST" });
            return { status: response.status, body: await response.text(), headers: Object.fromEntries(response.headers.entries()) };
        },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: noop };
    window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" } }, transformCallback: () => 1,
        invoke: async (command, args) => {
            nativeCalls.push({ command, args: structuredClone(args) });
            if (command === "load_runtime_workflow") return native.load(args);
            if (command === "open_file") return native.open(args);
            if (command === "plugin:event|listen") return 1;
            if (command === "plugin:event|unlisten" || command === "plugin:window|destroy") return null;
            throw new Error(`Unexpected native command: ${command}`);
        },
    };
    container = document.createElement("div"); document.body.append(container);
    opener = document.createElement("button"); opener.textContent = "Run"; document.body.append(opener);
    opener.focus(); root = createRoot(container);
});
test.afterEach(async () => {
    await act(async () => root.unmount());
    container.remove(); opener.remove();
    assert.equal(intervals.size, 0, "status polling must be cleaned up");
    await window.happyDOM.cancelAsync();
    globalThis.fetch = originals.get("fetch").value;
    delete window.__TAURI_INTERNALS__;
    delete window.__TAURI_EVENT_PLUGIN_INTERNALS__;
});
test.after(async () => {
    await server?.close();
    await window.happyDOM.cancelAsync();
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
});

const dialog = () => document.querySelector('[role="dialog"][aria-modal="false"]');
const button = (name) => {
    const found = [...dialog().querySelectorAll("button")]
        .find((element) => (element.getAttribute("aria-label") || element.textContent.trim()) === name);
    assert.ok(found, `Missing button: ${name}`); return found;
};
const field = (name) => {
    const label = [...dialog().querySelectorAll("label")]
        .find((element) => element.querySelector("span")?.textContent === name);
    assert.ok(label, `Missing field: ${name}`); return label.querySelector("input");
};
const fill = async (name, value) => act(async () => {
    const input = field(name);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
});
const click = async (name) => act(async () => button(name).click());
const mount = async (tab = workflow()) => {
    mounted = true;
    await act(async () => root.render(createElement(StrictMode, null,
        createElement(FeedbackProvider, null, createElement(Harness)))));
    if (tab) await act(async () => current.tabs.openTab(tab, { fit: false }));
};
const configure = async () => fill("Configuration path", " /configs/bonsai.xml ");
const posts = () => calls.filter((call) => call.method === "POST");
const stagedLoads = () => nativeCalls.filter(({ command }) => command === "load_runtime_workflow");
const stagedResult = (value = { success: true, messages: [] }, status = 200) => ({
    status, body: JSON.stringify(value), headers: { "content-type": "application/json" },
});
const assertNoSave = () => {
    assert.equal(nativeCalls.filter(({ command }) => ["save_file", "serialize_editor_workflow"].includes(command)).length, 0);
};
const statusReads = () => calls.filter((call) => call.url === "/api/status");
const statusText = () => [...dialog().querySelectorAll("dt")]
    .find((element) => element.textContent === "Engine").nextElementSibling.textContent;
const edit = async (expression = "2") => act(async () => current.graph.setNodes((nodes) => nodes.map((node) => ({
    ...node, data: { ...node.data, params: [{ key: "count", expr: expression }] },
}))));
const poll = async () => act(async () => {
    for (const { callback } of intervals.values()) callback();
});
const resolve = async (pending, value) => act(async () => { pending.resolve(value); });

test("snapshot uses the separate plain status route and exact string-list response fields", async () => {
    engine.currentStates = ["Work#1", "Work#1"];
    engine.stateIds = ["Root", "Work#1", "Root", "Done"];
    engine.transitions = ["Work.success", "Work.error", "Work.success"];
    for (const status of ["UNKNOWN", "LOADING", "INITIALIZED", "INITIALIZED_BUT_WARNINGS", "RUNNING", "PAUSED"]) {
        calls.length = 0; engine.status = ` ${status}\n`;
        const before = Date.now();
        const snapshot = await getWebCommanderSnapshot();
        assert.equal(snapshot.status, status);
        assert.ok(snapshot.checkedAt >= before && snapshot.checkedAt <= Date.now());
        const initialized = !["UNKNOWN", "LOADING"].includes(status);
        assert.deepEqual(snapshot.currentStates, initialized ? ["Work#1"] : []);
        assert.deepEqual(snapshot.stateIds, initialized ? ["Root", "Work#1", "Done"] : []);
        assert.deepEqual(snapshot.transitions, initialized ? ["Work.success", "Work.error"] : []);
        assert.deepEqual(calls.map((call) => call.url), initialized
            ? ["/api/status", "/api/bonsai/states", "/api/bonsai/all_states", "/api/bonsai/transitions"] : ["/api/status"]);
        for (const call of calls) {
            assert.equal(call.method, "GET");
            assert.equal(call.body, undefined); assert.equal(call.headers, undefined);
            assert.ok(call.signal instanceof AbortSignal);
        }
    }
});

test("malformed, JSON-wrapped and unknown statuses are rejected before state requests", async () => {
    for (const status of ["", "running", "READY", '"RUNNING"', '{"status":"RUNNING"}', "<html>RUNNING</html>"]) {
        calls.length = 0; engine.status = status;
        await assert.rejects(getWebCommanderSnapshot(), /recognized engine status/);
        assert.deepEqual(calls.map((call) => call.url), ["/api/status"]);
    }
});

test("snapshot rejects malformed JSON, missing fields and non-string list entries at every endpoint", async () => {
    engine.status = "RUNNING";
    for (const [endpoint, property] of [["states", "ids"], ["all_states", "ids"], ["transitions", "transitions"]]) {
        for (const value of ["not JSON", "null", "[]", "{}", JSON.stringify({ [property]: "Work" }),
            JSON.stringify({ [property]: ["Work", 1] }), JSON.stringify({ [property]: [null] })]) {
            respond = (call) => call.url === `/api/bonsai/${endpoint}` ? new Response(value) : engineResponse(call);
            await assert.rejects(getWebCommanderSnapshot(), new RegExp(`${endpoint} did not return (valid JSON|a list of ${property})`));
        }
    }
});

test("HTTP and transport failures do not become valid engine snapshots", async () => {
    engine.status = "RUNNING";
    for (const endpoint of ["/api/status", "/api/bonsai/states", "/api/bonsai/all_states", "/api/bonsai/transitions"]) {
        respond = (call) => call.url === endpoint ? new Response(" engine offline ", { status: 503 }) : engineResponse(call);
        await assert.rejects(getWebCommanderSnapshot(), /HTTP 503 - engine offline/);
    }
    respond = () => { throw "Connection refused"; };
    await assert.rejects(getWebCommanderSnapshot(), (reason) => reason === "Connection refused");
});

test("load sends required LoadData keys as JSON and recognizes omitted default messages", async () => {
    const payload = { pathToConfig: "/configs/bonsai.xml", pathToTask: "/workflows/current.xml",
        includeMapping: { BEH: "/behaviors" }, forceConfigure: true };
    const controller = new AbortController();
    respond = () => json({ success: true });
    assert.deepEqual(await loadWebCommander(payload, controller.signal), { success: true, messages: [] });
    assert.equal(calls[0].url, "/api/bonsai/load"); assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].headers, { "Content-Type": "application/json" });
    assert.equal(calls[0].body, JSON.stringify(payload));
    controller.abort(); assert.equal(calls[0].signal.aborted, true);
    respond = () => json({ success: true, messages: ["Loaded"] });
    assert.deepEqual(await loadWebCommander(payload), { success: true, messages: ["Loaded"] });
});

test("HTTP 200 unsuccessful load preserves diagnostics for authoritative engine-status gating", async () => {
    for (const result of [
        { success: false, messages: ["Bad configuration", "Unknown skill"] },
        { success: false, messages: [] }, { success: false },
    ]) {
        respond = () => json(result);
        assert.deepEqual(await loadWebCommander({}), { ...result, messages: result.messages ?? [] });
    }
});

test("only verified engine fault formats are categorized; arbitrary English stays neutral", () => {
    const warnings = ["State with id 'A' has only conditional transitions for event 'A.success'",
        "Skill A has ExitStatus success with and without ps "];
    const errors = ["State with id 'A' misses transition for event 'A.success'",
        "State with id 'A' sending event 'A.retry' that is not captured in transitions"];
    const diagnostics = ["Optional adapter unavailable", "WARNING: unlabelled adapter diagnostic", "Error loading optional plugin",
        "State A misses transition", "State with id 'A' has only conditional transitions for event 'A.success' plus more detail"];
    const messages = Object.freeze([...warnings, ...errors, ...diagnostics]);
    assert.deepEqual(classifyWebCommanderMessages(messages), { warnings, errors, diagnostics });
    assert.deepEqual(messages, [...warnings, ...errors, ...diagnostics]);
    assert.deepEqual(classifyWebCommanderMessages([]), { warnings: [], errors: [], diagnostics: [] });
});

test("load rejects malformed JSON and present invalid success/messages fields", async () => {
    for (const value of ["not JSON", "null", "[]", "{}", '{"success":"true","messages":[]}',
        '{"success":true,"messages":null}', '{"success":true,"messages":"ok"}', '{"success":true,"messages":[1]}']) {
        respond = () => new Response(value);
        await assert.rejects(loadWebCommander({}), /load did not return (valid JSON|a valid success\/messages result)/);
    }
    respond = () => new Response("Failed load", { status: 500 });
    await assert.rejects(loadWebCommander({}), /HTTP 500 - Failed load/);
});

test("desktop load stages the canonical immutable snapshot with the original file context", async () => {
    const snapshot = { ...workflow(), manualSlots: [{ path: "/needed", type: "String", slotKind: "slot" }], isModified: true };
    const before = structuredClone(snapshot);
    const payload = { pathToConfig: "/configs/bonsai.xml", pathToTask: snapshot.filePath,
        includeMapping: { BEH: "/behaviors" }, forceConfigure: true };
    native.load = () => stagedResult({ success: false, messages: ["Unclassified diagnostic"] });
    assert.deepEqual(await loadWebCommander(payload, undefined, snapshot), { success: false, messages: ["Unclassified diagnostic"] });
    assert.deepEqual(stagedLoads()[0].args, { request: buildRustEditorExportRequest(snapshot),
        pathToConfig: payload.pathToConfig, includeMapping: payload.includeMapping, forceConfigure: true,
        currentFilePath: snapshot.filePath });
    assert.deepEqual(snapshot, before); assert.equal(calls.length, 0); assertNoSave();
});

test("native staging HTTP, malformed-response and string failures cannot masquerade as successful loads", async () => {
    const snapshot = workflow();
    const payload = { pathToConfig: "/configs/bonsai.xml", includeMapping: {}, forceConfigure: false };
    native.load = () => stagedResult({ success: false }, 503);
    await assert.rejects(loadWebCommander(payload, undefined, snapshot), /HTTP 503/);
    for (const body of ["not JSON", "{}", '{"success":true,"messages":null}']) {
        native.load = () => ({ status: 200, body, headers: {} });
        await assert.rejects(loadWebCommander(payload, undefined, snapshot), /load did not return/);
    }
    native.load = () => { throw "Immutable staging permission denied"; };
    await assert.rejects(loadWebCommander(payload, undefined, snapshot), (reason) => String(reason).includes("Immutable staging permission denied"));
    assert.equal(calls.length, 0); assertNoSave();
});

test("aborting staged load stops awaiting native completion without a dialog-owned cleanup IPC", async () => {
    const pending = deferred(); native.load = () => pending.promise;
    const payload = { pathToConfig: "/configs/bonsai.xml", includeMapping: {}, forceConfigure: false };
    const controller = new AbortController();
    const load = loadWebCommander(payload, controller.signal, workflow());
    let stopped = false;
    const rejection = assert.rejects(load, { name: "AbortError" }).then(() => { stopped = true; });
    controller.abort(); await delay(0);
    const stoppedBeforeNativeCompletion = stopped;
    assert.equal(stagedLoads().length, 1); assert.equal(calls.length, 0);
    const before = nativeCalls.length;
    pending.resolve(stagedResult()); await rejection;
    assert.equal(stoppedBeforeNativeCompletion, true, "caller cancellation must not await the native-owned HTTP lifetime");
    assert.equal(nativeCalls.length, before, "late IPC completion must not trigger temporary-file deletion from JS");
    await assert.rejects(loadWebCommander(payload, controller.signal, workflow()), { name: "AbortError" });
    assert.equal(stagedLoads().length, 1); assertNoSave();
});

test("staged load has a caller deadline without releasing the native-owned staging lifetime", async (context) => {
    const deadline = new AbortController();
    context.mock.method(AbortSignal, "timeout", (milliseconds) => {
        assert.equal(milliseconds, 60000); return deadline.signal;
    });
    const pending = deferred(); native.load = () => pending.promise;
    const loading = loadWebCommander({ pathToConfig: "/configs/bonsai.xml", includeMapping: {}, forceConfigure: false }, undefined, workflow());
    const rejected = assert.rejects(loading, { name: "TimeoutError" });
    deadline.abort(new DOMException("Native load timed out", "TimeoutError"));
    await rejected;
    assert.equal(stagedLoads().length, 1); assert.equal(calls.length, 0);
    const before = nativeCalls.length;
    await resolve(pending, stagedResult());
    assert.equal(nativeCalls.length, before, "late native completion must not trigger JavaScript staging cleanup");
    assertNoSave();
});

test("execution uses POST, raw unquoted fire_event, and scalar stop_events Booleans", async () => {
    for (const endpoint of ["start", "pause", "resume", "stop"]) {
        assert.equal(await requestWebCommander(endpoint, { method: "POST" }), "acknowledged");
    }
    await requestWebCommander("fire_event", { method: "POST", body: "Work.success" });
    for (const enabled of [true, false]) await requestWebCommander("stop_events", { method: "POST", body: JSON.stringify(enabled) });
    assert.deepEqual(calls.map(({ url, method, body, headers }) => ({ url, method, body, headers })), [
        ...["start", "pause", "resume", "stop"].map((endpoint) => ({ url: `/api/bonsai/${endpoint}`, method: "POST", body: undefined, headers: undefined })),
        ...[["fire_event", "Work.success"], ["stop_events", "true"], ["stop_events", "false"]].map(([endpoint, body]) => ({
            url: `/api/bonsai/${endpoint}`, method: "POST", body, headers: { "Content-Type": "application/json" },
        })),
    ]);
});

test("HTTP errors include bounded response details and preserve transport failures", async () => {
    respond = () => new Response(`  ${"x".repeat(800)}  `, { status: 502 });
    await assert.rejects(requestWebCommander("pause", { method: "POST" }), (error) =>
        error.message === `WebCommander pause: HTTP 502 - ${"x".repeat(500)}`);
    respond = () => new Response("", { status: 500 });
    await assert.rejects(requestWebCommander("status"), { message: "WebCommander status: HTTP 500" });
    respond = () => { throw new Error("Network unavailable"); };
    await assert.rejects(requestWebCommander("stop", { method: "POST" }), /Network unavailable/);
});

test("caller abort and timeout signals stop waiting for requests and snapshot reads", async () => {
    respond = ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    const controller = new AbortController();
    const pending = requestWebCommander("load", { method: "POST", body: "{}", signal: controller.signal });
    const rejection = assert.rejects(pending, { name: "AbortError" });
    controller.abort(); await rejection;
    assert.equal(calls[0].signal.aborted, true);
    await assert.rejects(getWebCommanderSnapshot(controller.signal), { name: "AbortError" });
    const timeout = assert.rejects(requestWebCommander("status", { timeout: 5 }), { name: "TimeoutError" });
    await delay(20); await timeout;
});

test("panel completes staged load, start, pause, resume, event, automatic events, stop and authoritative status", async () => {
    await mount();
    assert.ok(document.activeElement === field("Configuration path"), "the configuration input receives initial focus");
    assert.equal(statusText(), "Not initialized"); assert.equal(button("Start").disabled, true);
    await configure();
    await act(async () => dialog().querySelector('input[type="checkbox"]').click());
    await click("Load configuration and state machine");
    assertNoSave(); assert.equal(statusText(), "Ready with warnings");
    assert.match(dialog().textContent, /Configuration loaded.*Optional adapter unavailable/);
    assert.equal(stagedLoads().length, 1);
    assert.deepEqual(stagedLoads()[0].args, { request: buildRustEditorExportRequest(current.tabs.getTabSnapshot()),
        pathToConfig: "/configs/bonsai.xml", currentFilePath: "/workflows/current.xml",
        includeMapping: { BEH: "/behaviors", OTHER: "/other" }, forceConfigure: true });
    assert.equal(button("Start").disabled, false);
    await click("Start"); assert.equal(statusText(), "Running");
    assert.equal(button("Load configuration and state machine").disabled, true);
    assert.equal(button("Resume").disabled, true); await click("Pause"); assert.equal(statusText(), "Paused");
    assert.equal(button("Pause").disabled, true);
    // An acknowledged resume need not actually resume the upstream engine.
    respond = (call) => call.url === "/api/bonsai/resume" ? new Response("acknowledged") : engineResponse(call);
    await click("Resume"); assert.equal(statusText(), "Paused"); assert.equal(button("Resume").disabled, false);
    assert.match(dialog().textContent, /Resume acknowledged by the engine/);
    respond = engineResponse;
    await click("Resume"); assert.equal(statusText(), "Running");
    await fill("Transition event", " Work.success "); await click("Send event");
    assert.equal(posts().at(-1).body, "Work.success");
    assert.deepEqual(posts().at(-1).headers, { "Content-Type": "application/json" });
    assert.match(dialog().textContent, /Event sent: Work.success/);
    await click("Enable automatic events"); assert.equal(posts().at(-1).body, "true");
    assert.equal(button("Enable automatic events").getAttribute("aria-pressed"), "true");
    await click("Disable automatic events"); assert.equal(posts().at(-1).body, "false");
    assert.equal(button("Disable automatic events").getAttribute("aria-pressed"), "true");
    await click("Stop"); assert.equal(statusText(), "Ready");
    engine.currentStates = ["Done"]; await click("Refresh status");
    assert.match(dialog().textContent, /Active statesDoneState count3Transition eventsWork.successWork.error/);
    assert.deepEqual(posts().map((call) => call.url), ["start", "pause", "resume", "resume", "fire_event", "stop_events", "stop_events", "stop"]
        .map((endpoint) => `/api/bonsai/${endpoint}`));
    assert.ok(calls.every((call) => call.url !== "/api/bonsai/status"));
    await click("Close run controls"); assert.ok(dialog() === null, "Close removes the panel");
    assert.ok(document.activeElement === opener, "Close restores the external Run opener after StrictMode replay");
    assert.equal(closes.length, 1); assert.equal(posts().at(-1).url, "/api/bonsai/stop");
});

test("native picker cancellation is quiet, string failures keep drafts, and retry selects configuration only", async () => {
    await mount(); await configure();
    await click("Browse"); assert.equal(field("Configuration path").value, " /configs/bonsai.xml ");
    assert.equal(dialog().querySelector('[role="alert"]'), null);
    native.open = () => { throw "Permission denied"; };
    await click("Browse"); assert.match(dialog().textContent, /Could not choose configuration. Permission denied.*try Browse again/);
    assert.equal(field("Configuration path").value, " /configs/bonsai.xml ");
    native.open = () => "/configs/retry.xml";
    await click("Browse"); assert.equal(field("Configuration path").value, "/configs/retry.xml");
    assert.equal(dialog().querySelector('[role="alert"]'), null);
    assert.deepEqual(nativeCalls.filter(({ command }) => command === "open_file").map(({ args }) => args),
        Array(3).fill({ title: "Choose Bonsai configuration" }));
    await click("Load configuration and state machine");
    assert.equal(stagedLoads()[0].args.currentFilePath, "/workflows/current.xml");
    assert.equal(nativeCalls.filter(({ command }) => command === "open_file").length, 3);
});

test("dirty and untitled native workflows load without saving or changing their checkpoint metadata", async () => {
    await mount(); await configure(); await edit();
    const before = current.tabs.getTabSnapshot();
    const pending = deferred(); native.load = () => pending.promise;
    await click("Load configuration and state machine");
    assert.equal(stagedLoads().length, 1); assert.equal(posts().length, 0); assertNoSave();
    assert.equal(button("Close run controls").disabled, true);
    assert.equal(dialog().getAttribute("aria-busy"), "true");
    engine.status = "INITIALIZED_BUT_WARNINGS"; await resolve(pending, stagedResult());
    assert.deepEqual(current.tabs.getTabSnapshot(), before);
    assert.equal(current.tabs.getTabSnapshot().isModified, true);
    assert.equal(button("Start").disabled, false, "the staged dirty snapshot is executable without a disk checkpoint");
    await act(async () => current.tabs.openTab({ ...workflow("new"), filePath: null }, { fit: false }));
    const untitled = current.tabs.getTabSnapshot(); native.load = () => stagedResult();
    await click("Load configuration and state machine");
    assert.equal(stagedLoads().length, 2); assert.equal(stagedLoads().at(-1).args.currentFilePath, null);
    assert.deepEqual(current.tabs.getTabSnapshot(), untitled); assertNoSave();
    assert.equal(button("Start").disabled, false);
    assert.equal(nativeCalls.filter(({ command }) => command === "open_file").length, 0);
});

test("path-only parent declarations are included in staged Run without saving the workflow", async () => {
    await mount(); await configure();
    await act(async () => current.graph.setManualSlots([{ path: "/needed", type: "String", slotKind: "slot" }]));
    const before = current.tabs.getTabSnapshot();
    await click("Load configuration and state machine");
    assertNoSave(); assert.equal(posts().length, 0);
    assert.deepEqual(stagedLoads()[0].args.request.extraSlotDeclarations, [{ key: "", state: "", xpath: "/needed", inherited: false }]);
    assert.deepEqual(current.tabs.getTabSnapshot(), before); assert.equal(before.isModified, true);
    assert.equal(button("Start").disabled, false);
});

test("native staging failures never save, choose another workflow or clear pending edits", async () => {
    await mount(); await configure(); await edit();
    const before = current.tabs.getTabSnapshot();
    native.load = () => { throw "Could not stage SCXML"; };
    await click("Load configuration and state machine");
    assert.match(dialog().textContent, /Could not stage SCXML/);
    assert.equal(posts().length, 0); assert.equal(current.tabs.getTabSnapshot().isModified, true);
    native.load = () => stagedResult({}, 500);
    await click("Load configuration and state machine");
    assert.match(dialog().textContent, /HTTP 500/);
    assert.equal(posts().length, 0); assert.equal(button("Load configuration and state machine").disabled, false);
    assert.deepEqual(current.tabs.getTabSnapshot(), before); assertNoSave();
    assert.equal(nativeCalls.filter(({ command }) => command === "open_file").length, 0);
});

test("uncertain replacement loads discard the prior owner even when the engine remains ready", async (context) => {
    await mount(); await configure();
    const originId = current.tabs.activeTabId;
    await act(async () => current.tabs.openTab(workflow("replacement"), { fit: false }));
    await act(async () => current.tabs.switchTab(originId));
    const originalTimeout = AbortSignal.timeout;
    let deadline;
    context.mock.method(AbortSignal, "timeout", (milliseconds) =>
        milliseconds === 60000 && deadline ? deadline.signal : originalTimeout(milliseconds));
    for (const failure of ["timeout", "malformed"]) {
        deadline = null;
        native.load = () => {
            engine.status = "INITIALIZED_BUT_WARNINGS";
            return stagedResult({ success: false, messages: ["Prior snapshot diagnostic"] });
        };
        await click("Load configuration and state machine");
        assert.equal(button("Start").disabled, false, "a valid issue-reporting result still confirms the ready owner");
        const confirmed = executionUpdates.findLast((update) => update.action === "load").workflow;
        assert.equal(confirmed.id, originId);
        assert.deepEqual(confirmed.includeMapping, { BEH: "/behaviors", OTHER: "/other" });
        await act(async () => current.tabs.switchTab("replacement"));
        const pending = deferred(); native.load = () => pending.promise;
        deadline = new AbortController();
        const mark = executionUpdates.length;
        await click("Load configuration and state machine");
        assert.ok(executionUpdates.at(-1).workflow === null, "replacement send immediately invalidates the prior owner");
        assert.equal(dialog().textContent.includes("Prior snapshot diagnostic"), false);
        assert.equal(dialog().textContent.includes("Sent to the engine:"), false);
        await act(async () => current.tabs.switchTab(originId));
        if (failure === "timeout") {
            await act(async () => deadline.abort(new DOMException("Replacement load timed out", "TimeoutError")));
            await resolve(pending, stagedResult());
        } else {
            await resolve(pending, { status: 200, body: "not JSON", headers: {} });
        }
        assert.equal(statusText(), "Ready with warnings");
        assert.equal(button("Start").disabled, true, "engine readiness cannot revive an unconfirmed snapshot owner");
        await click("Start"); await poll();
        assert.equal(posts().length, 0);
        assert.ok(executionUpdates.slice(mark).every((update) => update.workflow === null),
            "neither failure refresh nor late native completion may publish the prior owner");
        assertNoSave();
    }
});

test("dirty and untitled browser documents require canonical desktop staging rather than recovery export", async () => {
    delete window.__TAURI_INTERNALS__;
    await mount({ ...workflow(), filePath: null }); await configure();
    assert.equal([...dialog().querySelectorAll("button")].some((element) => element.textContent === "Browse"), false);
    await click("Load configuration and state machine");
    assert.match(dialog().textContent, /desktop app/i);
    assertNoSave(); assert.equal(posts().length, 0);
    await act(async () => current.tabs.openTab(workflow("saved"), { fit: false }));
    await click("Load configuration and state machine");
    assert.equal(posts().length, 1); assert.equal(JSON.parse(posts()[0].body).pathToTask, "/workflows/saved.xml");
    await edit(); const dirty = current.tabs.getTabSnapshot();
    await click("Load configuration and state machine");
    assert.match(dialog().textContent, /desktop app/i);
    assert.equal(posts().length, 1); assert.equal(stagedLoads().length, 0); assertNoSave();
    assert.deepEqual(current.tabs.getTabSnapshot(), dirty);
});

test("reported load errors and warnings do not block Start when the captured snapshot is initialized", async () => {
    await mount(); await configure(); await edit();
    const messages = ["State with id 'A' has only conditional transitions for event 'A.success'",
        "State with id 'A' misses transition for event 'A.success'", "Optional adapter unavailable"];
    for (const [status, success] of [["INITIALIZED", true], ["INITIALIZED_BUT_WARNINGS", false],
        ["INITIALIZED", false], ["UNKNOWN", false], ["LOADING", false]]) {
        engine.status = "UNKNOWN"; await click("Refresh status");
        native.load = () => { engine.status = status; return stagedResult({ success, messages }); };
        await click("Load configuration and state machine");
        assert.deepEqual([...dialog().querySelectorAll("strong")].filter((element) =>
            ["Warnings", "Errors", "Load diagnostics"].includes(element.textContent)).map((element) => element.textContent),
        ["Warnings", "Errors", "Load diagnostics"]);
        assert.equal(button("Start").disabled, ["UNKNOWN", "LOADING"].includes(status));
        if (!success) assert.match(dialog().textContent, status === "UNKNOWN" || status === "LOADING"
            ? /load reported issues and the engine is not ready/ : /load reported issues, but the engine is initialized/);
        assert.equal(current.tabs.getTabSnapshot().isModified, true); assertNoSave();
    }
});

test("unlabelled diagnostics remain neutral and do not create generic error or warning groups", async () => {
    await mount(); await configure();
    native.load = () => {
        engine.status = "INITIALIZED";
        return stagedResult({ success: true, messages: ["WARNING: adapter is optional", "Error text with no verified fault format"] });
    };
    await click("Load configuration and state machine");
    assert.match(dialog().textContent, /Load diagnostics.*WARNING: adapter is optional.*Error text with no verified fault format/);
    assert.equal([...dialog().querySelectorAll("strong")].some((element) => ["Errors", "Warnings"].includes(element.textContent)), false);
    assert.equal(dialog().querySelector('[role="alert"]'), null); assert.equal(button("Start").disabled, false);
});

test("same-tick duplicate native load captures one request without opening a save or task picker", async () => {
    await mount({ ...workflow(), filePath: null }); await configure(); await edit();
    const pending = deferred(); native.load = () => pending.promise;
    const load = button("Load configuration and state machine");
    await act(async () => { load.click(); load.click(); });
    assert.equal(stagedLoads().length, 1); assert.equal(stagedLoads()[0].args.currentFilePath, null);
    assert.equal(nativeCalls.filter(({ command }) => command === "open_file").length, 0); assertNoSave();
    engine.status = "INITIALIZED"; await resolve(pending, stagedResult());
    assert.equal(button("Start").disabled, false);
});

test("cached configuration persists after picker/manual changes and a fresh StrictMode component mount", async () => {
    window.localStorage.setItem("bonsai.runtimeConfiguration", "/configs/cached.xml");
    await mount(); assert.equal(field("Configuration path").value, "/configs/cached.xml");
    native.open = () => "/configs/picked.xml"; await click("Browse");
    assert.equal(window.localStorage.getItem("bonsai.runtimeConfiguration"), "/configs/picked.xml");
    await fill("Configuration path", " /configs/manual with spaces.xml ");
    await act(async () => root.unmount()); mounted = false; root = createRoot(container);
    await mount(); assert.equal(field("Configuration path").value, " /configs/manual with spaces.xml ");
    await click("Load configuration and state machine");
    assert.equal(stagedLoads()[0].args.pathToConfig, "/configs/manual with spaces.xml");
});

test("blocked configuration cache does not prevent editing a path or staging a workflow", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("Storage blocked"); } });
    try {
        await mount(); assert.equal(field("Configuration path").value, "");
        await configure(); await click("Load configuration and state machine");
        assert.equal(stagedLoads().length, 1); assert.equal(button("Start").disabled, false);
        assert.equal(dialog().querySelector('[role="alert"]'), null);
    } finally {
        if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
        else delete window.localStorage;
    }
});

test("available transitions refresh from the engine, select without sending, and allow custom manual events", async () => {
    engine.status = "RUNNING"; await mount();
    assert.match(dialog().textContent, /Currently available events/);
    await click("Work.success"); assert.equal(field("Transition event").value, "Work.success");
    assert.equal(posts().length, 0, "selection is not an executed transition");
    await click("Send event"); assert.equal(posts().at(-1).body, "Work.success");
    engine.transitions = ["Work.retry"]; await click("Refresh status");
    assert.equal([...dialog().querySelectorAll("button")].some((element) => element.textContent === "Work.success"), false);
    await click("Work.retry"); assert.equal(field("Transition event").value, "Work.retry");
    await fill("Transition event", " Custom.manual "); await click("Send event");
    assert.equal(posts().at(-1).body, "Custom.manual");
});

test("nonmodal panel scopes keyboard propagation without preventing natural Tab or outside focus", async () => {
    await mount();
    assert.equal(dialog().tagName, "SECTION"); assert.equal(document.querySelector("dialog[open]"), null);
    assert.equal(container.inert, false);
    assert.equal(dialog().hasAttribute("data-editor-shortcut-scope"), true);
    for (const key of ["Tab", "Delete", "Backspace"]) {
        const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        field("Configuration path").dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, `${key} must preserve normal input/focus behavior`);
    }
    const outside = document.createElement("input"); document.body.append(outside);
    try {
        outside.focus(); assert.ok(document.activeElement === outside, "the editor remains focusable outside the panel");
        await click("Close run controls");
        assert.ok(document.activeElement === outside, "Close does not steal external editor focus");
        assert.ok(dialog() === null, "Close removes the panel");
    } finally {
        outside.remove();
    }
});

test("panel clamps initial mobile placement and reopening after a closed-window resize", async () => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    try {
        window.happyDOM.setViewport({ width: 390, height: 844 });
        await mount(); assert.equal(dialog().style.left, "8px");
        await act(async () => root.unmount()); mounted = false; root = createRoot(container);
        window.happyDOM.setViewport({ width: 1440, height: 900 });
        await mount(); assert.equal(dialog().style.left, "948px");
        await act(async () => window.happyDOM.setViewport({ width: 1024, height: 768 }));
        assert.equal(dialog().style.left, "536px");
        await click("Close run controls");
        window.happyDOM.setViewport({ width: 390, height: 844 });
        await act(async () => current.setIsOpen(true));
        assert.equal(dialog().style.left, "8px");
    } finally {
        await act(async () => window.happyDOM.setViewport(viewport));
    }
});

test("title dragging prevents native selection and keeps the measured wrapped toolbar reachable", async () => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    try {
        window.happyDOM.setViewport({ width: 1440, height: 900 });
        await mount();
        const panel = dialog();
        panel.style.padding = "6px 16px 16px"; panel.style.border = "2px solid";
        const chrome = panel.querySelector(".runtime-commander-window-header");
        Object.defineProperty(chrome, "offsetHeight", { configurable: true,
            get: () => (window.innerWidth < 500 ? 190 : 128)
                + (chrome.querySelector('[aria-label="Expand run controls"]') ? 36 : 0) });
        const header = panel.querySelector(".runtime-commander-header");
        const title = header.querySelector("h3");
        const captures = []; header.setPointerCapture = (id) => captures.push(id);
        const pointer = (type, target, x, y, pointerId, button = 0) => {
            const event = new window.PointerEvent(type, { bubbles: true, cancelable: true,
                clientX: x, clientY: y, pointerId, button });
            target.dispatchEvent(event); return event;
        };
        await act(async () => {
            const down = pointer("pointerdown", title, 968, 104, 1);
            assert.equal(down.defaultPrevented, true, "title dragging must suppress native text selection");
            pointer("pointermove", header, 1439, 899, 1); pointer("pointerup", header, 1439, 899, 1);
        });
        assert.equal(panel.style.top, "738px");
        await act(async () => window.happyDOM.setViewport({ width: 390, height: 844 }));
        assert.equal(panel.style.left, "8px"); assert.equal(panel.style.top, "620px");
        for (const [index, [x, y]] of [[0, 0], [389, 843]].entries()) {
            await act(async () => {
                const down = pointer("pointerdown", title, parseFloat(panel.style.left) + 20,
                    parseFloat(panel.style.top) + 20, index + 2);
                assert.equal(down.defaultPrevented, true, "successive title drags must not select text");
                pointer("pointermove", header, x, y, index + 2); pointer("pointerup", header, x, y, index + 2);
            });
            assert.equal(panel.style.top, index === 0 ? "8px" : "620px");
        }
        assert.equal(parseFloat(panel.style.top) + chrome.offsetHeight + 34, window.innerHeight,
            "the complete header, padding, borders and safe inset must fit after drag and resize");
        await click("Minimize run controls");
        assert.equal(panel.style.top, "584px", "a newly wrapped minimized status row must remain reachable");
        assert.equal(parseFloat(panel.style.top) + chrome.offsetHeight + 34, window.innerHeight);
        await click("Expand run controls");
        assert.equal(panel.style.top, "584px");
        const control = pointer("pointerdown", button("Close run controls"), 20, 20, 4);
        const secondary = pointer("pointerdown", title, 20, 20, 5, 2);
        assert.equal(control.defaultPrevented, false, "header buttons retain normal pointer behavior");
        assert.equal(secondary.defaultPrevented, false); assert.deepEqual(captures, [1, 2, 3]);
    } finally {
        await act(async () => window.happyDOM.setViewport(viewport));
    }
});

test("Start publishes immutable ownership and background polling continues until Stop or a new load", async () => {
    await mount(); await configure(); await edit(); await click("Load configuration and state machine");
    const loaded = current.tabs.getTabSnapshot();
    await click("Start");
    const started = executionUpdates.find((update) => update.following && update.workflow && update.snapshot?.status === "RUNNING");
    assert.ok(started); assert.equal(started.workflow.id, loaded.id);
    assert.equal(started.workflow.documentGeneration, loaded.documentGeneration);
    assert.equal(started.workflow.fingerprint, loaded.fingerprint); assert.equal(started.followCamera, true);
    assert.deepEqual(started.workflow.nodes, loaded.nodes);
    assert.equal([...intervals.values()][0].milliseconds, 500);
    await click("Close run controls"); assert.equal(dialog(), null); assert.equal(intervals.size, 1);
    const before = statusReads().length; engine.currentStates = ["Done"]; await poll();
    assert.equal(statusReads().length, before + 1);
    assert.equal(executionUpdates.at(-1).workflow, started.workflow);
    assert.deepEqual(executionUpdates.at(-1).snapshot.currentStates, ["Done"]);
    assert.equal(executionUpdates.at(-1).following, true);
    await act(async () => current.setIsOpen(true));
    await click("Pause"); assert.equal(executionUpdates.at(-1).snapshot.status, "PAUSED");
    respond = (call) => call.url === "/api/bonsai/resume" ? new Response("acknowledged") : engineResponse(call);
    await click("Resume"); assert.equal(executionUpdates.at(-1).snapshot.status, "PAUSED");
    const mark = executionUpdates.length;
    await fill("Transition event", "Custom.manual"); await click("Send event");
    const sent = executionUpdates.slice(mark).filter((update) => update.event);
    assert.equal(sent.length, 1); assert.equal(sent[0].event.name, "Custom.manual");
    assert.equal(typeof sent[0].event.sentAt, "number");
    await poll(); assert.equal(executionUpdates.at(-1).event, null, "manual event attribution must not be replayed on every poll");
    await click("Stop"); assert.ok(executionUpdates.some((update) => update.workflow === null && update.snapshot === null && !update.following));
    assert.equal(executionUpdates.at(-1).following, false); assert.equal([...intervals.values()][0].milliseconds, 2000);
    await click("Load configuration and state machine"); assert.equal(executionUpdates.at(-1).following, false);
    await click("Close run controls"); assert.equal(intervals.size, 0);
});

test("delayed Start, Resume and status polling cannot restore a disabled Follow preference", async () => {
    await mount(); await configure(); await click("Load configuration and state machine");
    const follow = dialog().querySelectorAll('input[type="checkbox"]')[1];
    for (const action of ["start", "resume"]) {
        if (action === "resume") {
            await click("Pause"); await act(async () => follow.click());
        }
        assert.equal(follow.checked, true);
        const pending = deferred();
        respond = (call) => call.url === `/api/bonsai/${action}` ? pending.promise : engineResponse(call);
        await click(action === "start" ? "Start" : "Resume");
        const mark = executionUpdates.length;
        await act(async () => follow.click());
        engine.status = "RUNNING"; await resolve(pending, new Response("acknowledged"));
        const updates = executionUpdates.slice(mark);
        assert.ok(updates.some((update) => update.action === action && update.following), "the delayed command completes");
        assert.ok(updates.every((update) => update.followCamera === false), "post-await publications use the latest Follow flag");
        assert.equal(follow.checked, false); respond = engineResponse;
    }
    await act(async () => follow.click());
    const pending = deferred();
    respond = (call) => call.url === "/api/status" ? pending.promise : engineResponse(call);
    await poll();
    const mark = executionUpdates.length;
    await act(async () => follow.click()); await resolve(pending, new Response("RUNNING"));
    assert.equal(executionUpdates.at(-1).snapshot.status, "RUNNING");
    assert.ok(executionUpdates.slice(mark).every((update) => update.followCamera === false), "a delayed poll cannot re-enable Follow");
    assert.equal(follow.checked, false);
});

test("edits made while staging do not mutate the captured request and block starting the old snapshot", async () => {
    await mount(); await configure(); await edit();
    const before = current.tabs.getTabSnapshot();
    const pending = deferred(); native.load = () => pending.promise;
    await click("Load configuration and state machine"); await edit("3");
    engine.status = "INITIALIZED"; await resolve(pending, stagedResult());
    assert.equal(posts().length, 0); assert.equal(current.tabs.getTabSnapshot().isModified, true);
    assert.deepEqual(stagedLoads()[0].args.request, buildRustEditorExportRequest(before)); assertNoSave();
    assert.equal(button("Start").disabled, true);
});

test("load completion publishes tab snapshots captured before native staging", async () => {
    await mount(); await configure();
    const originId = current.tabs.activeTabId;
    await act(async () => current.tabs.openTab(workflow("child"), { fit: false }));
    await act(async () => current.tabs.switchTab(originId));
    const before = current.tabs.getTabsSnapshot();
    const pending = deferred(); native.load = () => pending.promise;
    await click("Load configuration and state machine");
    await act(async () => current.tabs.switchTab("child"));
    await edit("3");
    engine.status = "INITIALIZED"; await resolve(pending, stagedResult());
    const loaded = executionUpdates.find((update) => update.action === "load");
    assert.ok(loaded); assert.equal(loaded.workflow.id, originId);
    assert.deepEqual(loaded.tabsSnapshot, before);
    assert.notDeepEqual(loaded.tabsSnapshot, current.tabs.getTabsSnapshot());
    assert.equal(button("Start").disabled, true); assertNoSave();
});

test("tab switch, switch-back and same-ID replacement during staging retain the captured document owner", async () => {
    await mount(); await configure();
    const originId = current.tabs.activeTabId;
    await act(async () => current.tabs.openTab(workflow("other"), { fit: false }));
    await act(async () => current.tabs.switchTab(originId));
    for (const change of [
        async () => act(async () => current.tabs.switchTab("other")),
        async () => { await act(async () => current.tabs.switchTab("other")); await act(async () => current.tabs.switchTab(originId)); },
        async () => act(async () => current.tabs.replaceTabDocument(originId, { ...workflow("replacement"), id: originId })),
    ]) {
        if (current.tabs.activeTabId !== originId) await act(async () => current.tabs.switchTab(originId));
        await edit(String(stagedLoads().length + 2));
        const before = current.tabs.getTabSnapshot();
        const pending = deferred(); native.load = () => pending.promise;
        await click("Load configuration and state machine"); await change();
        const selected = current.tabs.getTabSnapshot();
        engine.status = "INITIALIZED"; await resolve(pending, stagedResult());
        assert.equal(posts().length, 0);
        assert.deepEqual(stagedLoads().at(-1).args.request, buildRustEditorExportRequest(before));
        assert.deepEqual(current.tabs.getTabSnapshot(), selected); assertNoSave();
        for (const update of executionUpdates) {
            if (update.workflow) assert.notEqual(update.workflow.id, "other", "old load completion must not be attributed to a newly selected workflow");
        }
    }
    assert.equal(nativeCalls.filter(({ command }) => command === "open_file").length, 0);
});

test("live snapshot fences Start after edits made in the same tick as the command", async () => {
    await mount(); await configure(); await click("Load configuration and state machine");
    const start = button("Start");
    await act(async () => {
        current.graph.setNodes((nodes) => nodes.map((node) => ({ ...node, data: { ...node.data, label: "Changed live" } })));
        start.click();
    });
    assert.equal(posts().length, 0); assert.equal(stagedLoads().length, 1);
    assert.match(dialog().textContent, /Load the current version of the open state machine before starting/);
    assert.equal(button("Start").disabled, true);
});

test("same-tick duplicate commands, submits, browsing, Close and Escape are synchronously fenced", async () => {
    engine.status = "RUNNING"; await mount();
    const pending = deferred();
    respond = (call) => call.url === "/api/bonsai/pause" ? pending.promise : engineResponse(call);
    const pause = button("Pause"); const close = button("Close run controls"); const browse = button("Browse");
    await act(async () => {
        pause.click(); pause.click(); close.click(); browse.click();
        dialog().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        dialog().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(posts().length, 1); assert.equal(closes.length, 0);
    assert.equal(nativeCalls.filter(({ command }) => command === "open_file").length, 0);
    await poll(); assert.equal(posts().length, 1);
    engine.status = "PAUSED"; await resolve(pending, new Response("acknowledged"));
    await fill("Transition event", "Work.success");
    const event = deferred(); respond = (call) => call.url === "/api/bonsai/fire_event" ? event.promise : engineResponse(call);
    await act(async () => {
        const form = dialog().querySelector("form");
        for (let index = 0; index < 2; index += 1) form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(posts().filter((call) => call.url.endsWith("fire_event")).length, 1);
    await resolve(event, new Response("acknowledged"));
});

test("unsuccessful uninitialized load, malformed status and command HTTP failures are truthful and recoverable", async () => {
    await mount(); await configure();
    respond = (call) => call.url === "/api/bonsai/load" ? json({ success: false, messages: ["Configuration rejected"] }) : engineResponse(call);
    await click("Load configuration and state machine");
    assert.match(dialog().textContent, /Configuration rejected/);
    assert.match(dialog().textContent, /engine is not ready/);
    assert.equal(button("Start").disabled, true);
    respond = engineResponse; await click("Load configuration and state machine");
    respond = (call) => call.url === "/api/status" ? new Response("BAD_STATUS") : engineResponse(call);
    await click("Refresh status");
    assert.match(dialog().textContent, /Could not get engine status.*recognized engine status.*last successful status/);
    assert.equal(button("Start").disabled, true);
    respond = (call) => call.url === "/api/bonsai/start" ? new Response("Engine refused start", { status: 409 }) : engineResponse(call);
    await click("Refresh status"); await click("Start");
    assert.match(dialog().textContent, /HTTP 409 - Engine refused start.*Refresh status before retrying/);
    assert.equal(statusText(), "Ready with warnings"); assert.equal(button("Start").disabled, false);
});

test("idle polling starts only while open, skips in-flight reads and commands, and cleans up on close", async () => {
    startOpen = false; await mount();
    assert.equal(calls.length, 0); assert.equal(intervals.size, 0);
    await act(async () => current.setIsOpen(true));
    assert.equal(intervals.size, 1); assert.equal([...intervals.values()][0].milliseconds, 2000);
    const pending = deferred(); respond = (call) => call.url === "/api/status" ? pending.promise : engineResponse(call);
    const before = statusReads().length;
    await poll(); await poll(); assert.equal(statusReads().length, before + 1);
    await resolve(pending, new Response("UNKNOWN"));
    respond = engineResponse; await poll(); assert.equal(statusReads().length, before + 2);
    await configure();
    const command = deferred(); native.load = () => command.promise;
    await click("Load configuration and state machine"); const during = statusReads().length;
    await poll(); assert.equal(statusReads().length, during);
    await resolve(command, stagedResult());
    await click("Close run controls");
    assert.equal(intervals.size, 0); const closed = calls.length; await poll(); assert.equal(calls.length, closed);
});

test("StrictMode and close/reopen fence late status successes and failures even when fetch ignores abort", async () => {
    const stale = []; respond = () => { const pending = deferred(); stale.push(pending); return pending.promise; };
    await mount();
    assert.equal(stale.length, 2, "StrictMode replays the initial read effect");
    assert.equal(statusReads()[0].signal.aborted, true);
    await click("Close run controls");
    assert.equal(statusReads()[1].signal.aborted, true);
    respond = engineResponse; await act(async () => current.setIsOpen(true));
    assert.equal(statusText(), "Not initialized");
    await resolve(stale[0], new Response("RUNNING"));
    await act(async () => stale[1].reject(new Error("stale failure")));
    assert.equal(statusText(), "Not initialized"); assert.equal(dialog().querySelector('[role="alert"]'), null);
    assert.equal(intervals.size, 1);
});

test("manual configuration edits fence late native picker results and same-tick duplicate browsing", async () => {
    await mount(); await configure();
    const pending = deferred(); native.open = () => pending.promise;
    const browse = button("Browse");
    await act(async () => { browse.click(); browse.click(); });
    assert.equal(nativeCalls.filter(({ command }) => command === "open_file").length, 1);
    assert.equal(button("Load configuration and state machine").disabled, true);
    await fill("Configuration path", "/configs/manual.xml");
    await resolve(pending, "/configs/stale.xml");
    assert.equal(field("Configuration path").value, "/configs/manual.xml");
    assert.equal(button("Browse").disabled, false);
});

test("close/reopen ignores stale picker paths and string failures without blocking the new panel", async () => {
    await mount(); await configure();
    const pending = deferred(); native.open = () => pending.promise;
    await click("Browse"); await click("Close run controls");
    await act(async () => current.setIsOpen(true));
    await resolve(pending, "/configs/stale.xml");
    assert.equal(field("Configuration path").value, " /configs/bonsai.xml ");
    assert.equal(dialog().querySelector('[role="alert"]'), null);
    const failure = deferred(); native.open = () => failure.promise;
    await click("Browse"); await click("Close run controls");
    await act(async () => current.setIsOpen(true));
    await act(async () => failure.reject("stale permission error"));
    assert.equal(dialog().querySelector('[role="alert"]'), null);
    assert.equal(button("Browse").disabled, false);
});

test("externally closed pending commands abort and cannot publish acknowledgements after reopen", async () => {
    engine.status = "RUNNING"; await mount();
    const pending = deferred(); respond = (call) => call.url === "/api/bonsai/pause" ? pending.promise : engineResponse(call);
    await click("Pause");
    await act(async () => current.setIsOpen(false));
    assert.equal(posts()[0].signal.aborted, true);
    await act(async () => current.setIsOpen(true));
    assert.equal(statusText(), "Running");
    assert.equal(button("Pause").disabled, false);
    assert.equal(dialog().getAttribute("aria-busy"), "false");
    const next = deferred(); respond = (call) => call.url === "/api/bonsai/pause" ? next.promise : engineResponse(call);
    await click("Pause");
    await resolve(pending, new Response("old acknowledgement"));
    assert.equal(dialog().getAttribute("aria-busy"), "true", "an old completion must not release the new command lock");
    assert.equal(dialog().textContent.includes("Pause acknowledged"), false);
    engine.status = "PAUSED"; await resolve(next, new Response("new acknowledgement"));
    assert.equal(statusText(), "Paused"); assert.equal(dialog().getAttribute("aria-busy"), "false");
    assert.match(dialog().textContent, /Pause acknowledged by the engine/);
});

test("unmount aborts reads/commands and fences pending native browse/staging continuations", async () => {
    for (const action of ["status", "browse", "stage", "command"]) {
        if (mounted) { await act(async () => root.unmount()); mounted = false; root = createRoot(container); }
        const pending = deferred(); respond = engineResponse; engine.status = action === "command" ? "RUNNING" : "UNKNOWN";
        if (action === "status") respond = () => pending.promise;
        await mount();
        if (action === "browse") { native.open = () => pending.promise; await click("Browse"); }
        if (action === "stage") { await configure(); await edit(); native.load = () => pending.promise; await click("Load configuration and state machine"); }
        if (action === "command") {
            respond = (call) => call.url === "/api/bonsai/pause" ? pending.promise : engineResponse(call);
            await click("Pause");
        }
        const before = calls.length;
        await act(async () => root.unmount()); mounted = false;
        assert.equal(intervals.size, 0); assert.equal(dialog(), null);
        if (action === "status") assert.equal(statusReads().at(-1).signal.aborted, true);
        if (action === "command") assert.equal(posts().at(-1).signal.aborted, true);
        const updates = executionUpdates.length;
        await resolve(pending, action === "browse" ? "/configs/stale.xml" : action === "stage" ? stagedResult() : new Response("UNKNOWN"));
        if (action !== "status") assert.equal(calls.length, before, `late ${action} must not refresh or send a new command`);
        assert.equal(executionUpdates.length, updates, `late ${action} must not publish live execution`);
        root = createRoot(container);
    }
});
