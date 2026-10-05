import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode, useCallback, useLayoutEffect, useState } from "react";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
const originals = new Map();
let createRoot;
let server;
let hooks;
let root;
let container;
let current;
let history;
let mounted;
let requests;
let nodeWrites;
let slotCalls;
let syncCalls;
let frames;
let frameArchive;
let canceledFrames;
let nextFrame;
let mountRequests;

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const skill = (id = "skill", data = {}) => ({
    id, type: "custom", position: { x: 10, y: 20 },
    data: {
        label: id, fullSkillName: "pkg.Skill#instance", src: "",
        params: [{ key: "rate", expr: "1" }], events: [{ id: "done", target: "other" }],
        inSlots: [{ key: "input", type: "String", path: "/input" }], outSlots: [],
        ...data,
    },
});
const workflow = (id = "a", nodes = [skill()]) => ({
    id, title: id, fileName: `${id}.xml`, nodes, edges: [],
    manualSlots: [], slotNodes: [], slotEdges: [], globalDataModel: [], inheritedGlobalDataModel: [],
});
const definition = (event = "configured", extra = {}) => ({
    events: [{ event, description: `${event} description` }],
    inSlots: [{ key: "input", type: "String" }], outSlots: [], ...extra,
});
const noop = () => {};
const syncDocument = async () => null;
const fetchSkillData = (name, params) => {
    const request = { name, params, ...deferred() };
    requests.push(request);
    return request.promise;
};

function HistoryProbe({ graph, tabs, selectedNodeId, setSelectedNodeId }) {
    const api = hooks.useEditorHistory({
        ...graph, activeTabId: tabs.activeTabId, activeMode: "overview", isDraggingNode: false,
        selectedNodeId, setSelectedNodeId, setRightPanelTab: noop, updateNodeInternals: noop,
        syncRustDocument: syncDocument,
    });
    useLayoutEffect(() => { history = api; });
    return null;
}

function Harness({ withHistory = false, startOnMount = false }) {
    const graph = hooks.useEditorGraphState();
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const tabs = hooks.useWorkflowTabs({
        ...graph, selectedNodeId, setSelectedNodeId, isDraggingNode,
        fitView: noop, getViewport: noop, setViewport: noop, syncRustDocument: syncDocument,
    });
    const slots = hooks.useSlotGraph(graph);
    const { setNodes: setGraphNodes, replaceDocument } = graph;
    const setNodes = useCallback((value) => {
        nodeWrites.push(value);
        setGraphNodes(value);
    }, [setGraphNodes]);
    const dynamic = hooks.useDynamicSkillConfiguration({
        getDocumentSnapshot: graph.getDocumentSnapshot,
        getActiveDocumentIdentity: tabs.getActiveDocumentIdentity,
        setNodes, fetchSkillData,
        // Deliberately replaced on every render, just like the real slot hook.
        checkSlotConnection: (...args) => {
            slotCalls.push(args);
            slots.checkSlotConnection(...args);
        },
        syncStateConfigurationAfterCommit: async (nodeId) => {
            syncCalls.push({ nodeId, identity: tabs.getActiveDocumentIdentity() });
        },
    });
    const { updateEventsFromParameters } = dynamic;
    useLayoutEffect(() => { current = { graph, tabs, dynamic, setIsDraggingNode }; }, [graph, tabs, dynamic]);
    useLayoutEffect(() => {
        if (!startOnMount) return;
        replaceDocument(workflow());
        const completion = updateEventsFromParameters("skill");
        requests.at(-1).completion = completion;
        mountRequests.push(completion);
    }, [startOnMount, replaceDocument, updateEventsFromParameters]);
    return withHistory ? createElement(HistoryProbe, { graph, tabs, selectedNodeId, setSelectedNodeId }) : null;
}

test.before(async () => {
    for (const [name, value] of Object.entries({
        window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const requestFrame = (callback) => {
        const id = nextFrame++;
        frames.set(id, callback);
        frameArchive.set(id, callback);
        return id;
    };
    window.requestAnimationFrame = requestFrame;
    window.cancelAnimationFrame = (id) => { canceledFrames.push(id); frames.delete(id); };
    originals.set("requestAnimationFrame", Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"));
    Object.defineProperty(globalThis, "requestAnimationFrame", { value: requestFrame, configurable: true });
    ({ createRoot } = await import("react-dom/client"));
    const { createServer } = await import("vite");
    server = await createServer({
        configFile: false, appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
    const modules = await Promise.all([
        "graph/useEditorGraphState", "document/useWorkflowTabs", "library/useDynamicSkillConfiguration", "graph/useSlotGraph", "document/useEditorHistory",
    ].map((name) => server.ssrLoadModule(`/src/hooks/${name}.js`)));
    hooks = Object.assign({}, ...modules);
});

test.beforeEach(async () => {
    requests = []; nodeWrites = []; slotCalls = []; syncCalls = []; mountRequests = [];
    frames = new Map(); frameArchive = new Map(); canceledFrames = []; nextFrame = 0;
    history = null;
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    mounted = true;
    await act(async () => root.render(createElement(Harness)));
});

const unmount = async () => {
    if (!mounted) return;
    await act(async () => root.unmount());
    mounted = false;
};
test.afterEach(async () => {
    await unmount();
    container.remove();
    await window.happyDOM.cancelAsync();
});
test.after(async () => {
    await server?.close();
    await window.happyDOM.cancelAsync();
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
});

const flushFrames = async () => {
    for (let pass = 0; frames.size; pass += 1) {
        assert.ok(pass < 10, "RAF queue must converge");
        await act(async () => {
            const callbacks = [...frames.values()];
            frames.clear();
            callbacks.forEach((callback) => callback(0));
        });
    }
};
const open = async (tab = workflow()) => {
    await act(async () => current.tabs.openTab(tab, { fit: false }));
    await flushFrames();
};
const start = (nodeId = "skill", params = null) => {
    const completion = current.dynamic.updateEventsFromParameters(nodeId, params);
    const request = requests.at(-1);
    request.completion = completion;
    return request;
};
const reply = async (request, data = definition()) => act(async () => {
    request.resolve(data);
    await request.completion;
});
const editSkill = async (update) => act(async () => {
    current.graph.setNodes((nodes) => nodes.map((node) => node.id === "skill" ? update(node) : node));
});
const assertDiscarded = (snapshot, writes = 0, syncs = 0) => {
    assert.equal(current.graph.getDocumentSnapshot(), snapshot, "discarded response must not publish even a no-op update");
    assert.equal(nodeWrites.length, writes);
    assert.equal(syncCalls.length, syncs);
    assert.equal(slotCalls.length, 0);
};

test("live identity is constant-cost, edit-stable and advances synchronously on activation and replacement", async () => {
    const getter = current.tabs.getActiveDocumentIdentity;
    assert.deepEqual(getter(), { id: "tab-1", documentGeneration: 0, activationGeneration: 0 });
    await open();
    const first = getter();
    assert.deepEqual(first, { id: "a", documentGeneration: 1, activationGeneration: 1 });
    await editSkill((node) => ({ ...node, position: { x: 500, y: 600 } }));
    await act(async () => current.setIsDraggingNode(true));
    assert.equal(current.tabs.getActiveDocumentIdentity, getter);
    assert.equal(getter(), first);
    const snapshot = current.graph.getDocumentSnapshot();
    const nodes = snapshot.nodes;
    let reads = 0;
    Object.defineProperty(snapshot, "nodes", { configurable: true, get: () => { reads += 1; return nodes; } });
    for (let index = 0; index < 100; index += 1) assert.equal(getter(), first);
    assert.equal(reads, 0, "identity reads must not traverse or fingerprint the graph");
    await open(workflow("b"));
    await act(async () => {
        current.tabs.switchTab("a");
        assert.equal(getter().id, "a");
        assert.equal(current.graph.getDocumentSnapshot().nodes, nodes);
        assert.notEqual(getter(), first, "switch-back must not revive an old activation");
        const beforeReplacement = getter();
        current.tabs.replaceTabDocument("a", workflow("a"));
        assert.ok(getter().documentGeneration > beforeReplacement.documentGeneration);
        assert.ok(getter().activationGeneration > beforeReplacement.activationGeneration);
    });
});

for (const switchBack of [false, true]) {
    test(`pending replies are discarded after tab switch${switchBack ? " and switch-back" : ""}`, async () => {
        await open();
        const request = start();
        await open(workflow("b"));
        if (switchBack) await act(async () => current.tabs.switchTab("a"));
        const snapshot = current.graph.getDocumentSnapshot();
        await reply(request);
        assertDiscarded(snapshot);
        await flushFrames();
        assertDiscarded(snapshot);
    });
}

test("same-ID replacement rejects old replies even with identical node IDs, skill names and inputs", async () => {
    await open();
    const origin = current.tabs.getActiveDocumentIdentity();
    const request = start();
    await act(async () => current.tabs.replaceTabDocument("a", workflow("a")));
    const replacement = current.tabs.getActiveDocumentIdentity();
    assert.equal(replacement.id, origin.id);
    assert.notEqual(replacement.documentGeneration, origin.documentGeneration);
    const snapshot = current.graph.getDocumentSnapshot();
    await reply(request);
    assertDiscarded(snapshot);
});

test("closed documents reopened with the same tab and node IDs have a new document generation", async () => {
    await open();
    const origin = current.tabs.getActiveDocumentIdentity();
    const request = start();
    await open(workflow("b"));
    await act(async () => current.tabs.closeTab("a"));
    await open(workflow("a"));
    assert.equal(current.tabs.getActiveDocumentIdentity().id, origin.id);
    assert.ok(current.tabs.getActiveDocumentIdentity().documentGeneration > origin.documentGeneration);
    const snapshot = current.graph.getDocumentSnapshot();
    await reply(request);
    assertDiscarded(snapshot);
});

test("real undo of a consumed input fences an outstanding configuration", async () => {
    await open();
    await act(async () => root.render(createElement(Harness, { withHistory: true })));
    const identity = current.tabs.getActiveDocumentIdentity();
    await editSkill((node) => ({ ...node, data: { ...node.data, params: [{ key: "rate", expr: "2" }] } }));
    const request = start("skill", [{ key: "rate", expr: "2" }]);
    await act(async () => assert.equal(history.undo(), true));
    assert.equal(current.graph.getDocumentSnapshot().nodes[0].data.params[0].expr, "1");
    assert.equal(current.tabs.getActiveDocumentIdentity(), identity);
    const snapshot = current.graph.getDocumentSnapshot();
    await reply(request);
    assertDiscarded(snapshot);
    await flushFrames();
    assertDiscarded(snapshot);
});

for (const newestFirst of [false, true]) {
    test(`latest request wins for identical inputs when ${newestFirst ? "newer" : "older"} response arrives first`, async () => {
        await open();
        const older = start();
        const newer = start();
        if (newestFirst) {
            await reply(newer, definition("newer"));
            const snapshot = current.graph.getDocumentSnapshot();
            await reply(older, definition("older"));
            assertDiscarded(snapshot, 1, 1);
        } else {
            const snapshot = current.graph.getDocumentSnapshot();
            await reply(older, definition("older"));
            assertDiscarded(snapshot);
            await reply(newer, definition("newer"));
        }
        assert.equal(current.graph.getDocumentSnapshot().nodes[0].data.events[0].id, "newer");
        assert.equal(nodeWrites.length, 1);
        assert.ok(nodeWrites.every(Array.isArray), "hook must not put effects inside a state updater");
        await flushFrames();
        assert.equal(slotCalls.length, 1);
    });
}

test("request versions are never reused after failed-request or successful-RAF cleanup", async () => {
    await open();
    for (const cleanup of ["failure", "frame"]) {
        const older = start();
        const newer = start();
        await reply(newer, cleanup === "failure" ? null : definition("cleaned"));
        await flushFrames();
        const fresh = start();
        const snapshot = current.graph.getDocumentSnapshot();
        const writes = nodeWrites.length;
        const syncs = syncCalls.length;
        await reply(older, definition("revived"));
        assert.equal(current.graph.getDocumentSnapshot(), snapshot);
        assert.equal(nodeWrites.length, writes);
        assert.equal(syncCalls.length, syncs);
        await reply(fresh, definition("fresh"));
        await flushFrames();
        assert.equal(current.graph.nodes[0].data.events[0].id, "fresh");
    }
});

test("StrictMode cleanup and setup cannot make an earlier request current again", async () => {
    await act(async () => root.render(createElement(StrictMode, null, createElement(Harness, { startOnMount: true }))));
    assert.equal(mountRequests.length, 2);
    await reply(requests[1], null);
    const fresh = start();
    const snapshot = current.graph.getDocumentSnapshot();
    await reply(requests[0], definition("old mount"));
    assertDiscarded(snapshot);
    await reply(fresh, definition("new mount"));
    assert.equal(current.graph.nodes[0].data.events[0].id, "new mount");
});

for (const [name, repurpose] of [
    ["deleted", () => []],
    ["type changed", (node) => [{ ...node, type: "submachine" }]],
    ["skill changed", (node) => [{ ...node, data: { ...node.data, fullSkillName: "pkg.Other#instance" } }]],
    ["instance changed", (node) => [{ ...node, data: { ...node.data, fullSkillName: "pkg.Skill#replacement" } }]],
    ["source changed", (node) => [{ ...node, data: { ...node.data, src: "${BEH}/replacement.xml" } }]],
    ["clone source changed", (node) => [{ ...node, data: { ...node.data, isSkillClone: true, cloneOfNodeId: "other" } }]],
    ["semantic identity changed", (node) => [{ ...node, data: { ...node.data, scxmlStateId: "replacement" } }]],
]) {
    test(`pending configuration is rejected when its node is ${name}`, async () => {
        await open();
        const request = start();
        await act(async () => current.graph.setNodes(repurpose(current.graph.nodes[0])));
        const snapshot = current.graph.getDocumentSnapshot();
        await reply(request);
        assertDiscarded(snapshot);
    });
}

test("live callbacks survive position updates and normalized inputs rebase onto all unrelated edits", async () => {
    const params = [
        { key: "text", expr: " 'a\\'b' " }, { key: "count", expr: 0 }, { key: "enabled", expr: false },
        { key: "empty", expr: "  ", default: "not supplied" }, { key: "missing", expr: null },
    ];
    await open(workflow("a", [skill("skill", { params }), skill("other")]));
    const callback = current.dynamic.updateEventsFromParameters;
    const identity = current.tabs.getActiveDocumentIdentity();
    let request;
    await act(async () => {
        current.graph.setNodes((nodes) => nodes.map((node) => ({ ...node, position: { x: 300, y: 400 } })));
        request = start();
    });
    assert.equal(request.name, "pkg.Skill");
    assert.deepEqual(request.params, { text: " 'a\\'b' ", count: 0, enabled: false });
    assert.equal(current.dynamic.updateEventsFromParameters, callback);
    await editSkill((node) => ({
        ...node, selected: true, position: { x: 700, y: 800 },
        data: {
            ...node.data, label: "unrelated label", onEntry: [{ location: "v", expr: "1" }],
            params: [params[2], { ...params[0], expr: "a'b" }, params[1], { ...params[3], expr: undefined }],
            events: [{ id: "done", target: "new-target", cond: "@ready", assignments: [{ location: "v", expr: "2" }] }],
            inSlots: [{ key: "input", type: " string ", path: "/edited", inherited: { state: "parent" }, description: "local" }],
        },
    }));
    await act(async () => {
        current.graph.setNodes((nodes) => [...nodes, skill("added")]);
        current.graph.setEdges([{ id: "edge", source: "skill", target: "added" }]);
        current.graph.setManualSlots([{ path: "/manual", type: "Int" }]);
        current.graph.setGlobalDataModel([{ id: "unrelated", expr: "2" }]);
    });
    assert.equal(current.dynamic.updateEventsFromParameters, callback);
    assert.equal(current.tabs.getActiveDocumentIdentity(), identity);
    const before = current.graph.getDocumentSnapshot();
    await reply(request, definition("done", { sensors: ["sensor"], actuator: ["actuator"] }));
    const after = current.graph.getDocumentSnapshot();
    const configured = after.nodes[0];
    assert.deepEqual(configured.position, { x: 700, y: 800 });
    assert.equal(configured.selected, true);
    assert.equal(configured.data.label, "unrelated label");
    assert.equal(configured.data.onEntry, before.nodes[0].data.onEntry);
    assert.equal(configured.data.params, before.nodes[0].data.params);
    assert.equal(configured.data.events[0].target, "new-target");
    assert.equal(configured.data.events[0].cond, "@ready");
    assert.equal(configured.data.events[0].assignments, before.nodes[0].data.events[0].assignments);
    assert.equal(configured.data.inSlots[0].path, "/edited");
    assert.equal(configured.data.inSlots[0].inherited, before.nodes[0].data.inSlots[0].inherited);
    assert.deepEqual(configured.data.sensors, ["sensor"]);
    assert.deepEqual(configured.data.actuators, ["actuator"]);
    assert.equal(after.nodes[1], before.nodes[1]);
    assert.equal(after.nodes[2], before.nodes[2]);
    for (const key of ["edges", "manualSlots", "globalDataModel"]) assert.equal(after[key], before[key]);
    await flushFrames();
    assert.equal(slotCalls.length, 1);
    assert.ok(current.graph.slotNodes.some((node) => node.id === "slot-edited"));
    assert.ok(current.graph.slotNodes.some((node) => node.id === "slot-manual"));
});

test("same-frame parameter edits are captured live and mismatched overrides cannot be applied", async () => {
    await open();
    let request;
    await act(async () => {
        current.graph.setNodes((nodes) => nodes.map((node) => ({
            ...node, data: { ...node.data, params: [{ key: "rate", expr: "3" }] },
        })));
        request = start();
        assert.deepEqual(request.params, { rate: "3" });
    });
    await reply(request);
    await flushFrames();
    slotCalls.length = 0;
    const override = start("skill", [{ key: "rate", expr: "uncommitted" }]);
    const snapshot = current.graph.getDocumentSnapshot();
    await reply(override);
    assertDiscarded(snapshot, 1, 1);
});

test("slot rebuilds coalesce across nodes and use all four latest graph collections", async () => {
    await open(workflow("a", [skill(), skill("second")]));
    const first = start();
    const second = start("second");
    await reply(first);
    await reply(second);
    assert.equal(frames.size, 1);
    await act(async () => {
        current.graph.setManualSlots([{ path: "/fresh-manual", type: "Int" }]);
        current.graph.setSlotNodes([{ id: "slot-input", type: "slot", position: { x: 900, y: 901 }, data: {} }]);
        current.graph.setSlotEdges([{
            id: "preserved-edge", source: "skill", target: "slot-input",
            data: { edgeKind: "slot", skillNodeId: "skill", access: "read", slotIndex: 0, controlPoints: [{ x: 1, y: 2 }] },
        }]);
        current.graph.onNodesChange([{ id: "skill", type: "position", position: { x: 700, y: 701 } }]);
    });
    const latest = current.graph.getDocumentSnapshot();
    await flushFrames();
    assert.equal(slotCalls.length, 1);
    assert.deepEqual(slotCalls[0], [latest.nodes, latest.manualSlots, latest.slotNodes, latest.slotEdges]);
    assert.deepEqual(current.graph.slotNodes.find((node) => node.id === "slot-input").position, { x: 900, y: 901 });
    assert.ok(current.graph.slotNodes.some((node) => node.id === "slot-fresh-manual"));
    assert.deepEqual(current.graph.slotEdges.find((edge) => edge.id === "preserved-edge").data.controlPoints, [{ x: 1, y: 2 }]);
});

for (const change of ["switch", "switch-back", "replace", "delete", "source", "input", "newer-request"]) {
    test(`scheduled slot work is fenced after ${change}`, async () => {
        await open();
        const request = start();
        await reply(request);
        assert.equal(frames.size, 1);
        await act(async () => {
            if (change.startsWith("switch")) {
                current.tabs.openTab(workflow("b"), { fit: false });
                if (change === "switch-back") current.tabs.switchTab("a");
            } else if (change === "replace") current.tabs.replaceTabDocument("a", workflow("a"));
            else if (change === "delete") current.graph.setNodes([]);
            else if (change === "newer-request") start();
            else current.graph.setNodes((nodes) => nodes.map((node) => ({
                ...node, data: {
                    ...node.data,
                    ...(change === "source" ? { src: "replacement.xml" } : { params: [{ key: "rate", expr: "undo" }] }),
                },
            })));
        });
        const snapshot = current.graph.getDocumentSnapshot();
        await flushFrames();
        assertDiscarded(snapshot, 1, 1);
    });
}

test("unmount fences replies, late API calls and even a forcibly invoked canceled frame with ID zero", async () => {
    await act(async () => current.graph.replaceDocument(workflow()));
    const accepted = start();
    await reply(accepted);
    assert.ok(frames.has(0));
    const pending = start();
    const callback = current.dynamic.updateEventsFromParameters;
    const snapshot = current.graph.getDocumentSnapshot();
    await unmount();
    assert.deepEqual(canceledFrames, [0]);
    assert.equal(frames.size, 0);
    await reply(pending);
    await act(async () => frameArchive.get(0)(0));
    await callback("skill");
    assertDiscarded(snapshot, 1, 1);
    assert.equal(requests.length, 2);
});

test("indexed reconciliation preserves first-wins duplicates, falsy expressions and exact field fallbacks", async () => {
    const inherited = { state: "parent", xpath: "/first" };
    const params = [
        { key: "zero", expr: 0, type: "Int", description: "zero description", default: 99 },
        { key: "zero", expr: 7, type: "Other", description: "later" },
        { key: "false", expr: false, type: "Bool" }, { key: "empty", expr: "", type: "String" },
        { key: "null", expr: null }, { key: "removed", expr: "gone" }, { key: NaN, expr: "not matched" },
    ];
    const slots = [
        { key: "same", type: " String ", path: "/first", description: "first", inherited },
        { key: "same", type: "string", path: "/later", description: "later" },
        { key: "same", type: "Int", path: "/int" },
        { key: "empty", type: "", path: false, inherited: false, description: "fallback" },
        { key: "a|b", type: "C", path: "/delimiter" }, { key: "a", type: "b|c", path: "/other" },
        { key: NaN, type: "String", path: "/not-matched" },
    ];
    const requestedSlots = [
        { key: "same", type: "STRING", description: null, path: "/server", inherited: { state: "server" } },
        { key: "same", type: "int", description: "", extra: "retained" },
        { key: "same", type: "Float" }, { key: "empty", type: "", description: 0 },
        { key: "a|b", type: "c" }, { key: "a", type: "B|C" }, { key: NaN, type: "String" },
    ];
    const requestedParams = [
        { key: "zero", type: "", default: 0, required: "yes", description: null },
        { key: "false", default: false, required: 0, description: "" },
        { key: "empty", default: "", expr: "server" }, { key: "null" }, { key: "new", default: "default" },
        { key: NaN, type: "String" },
    ];
    await open(workflow("a", [skill("skill", { params, inSlots: slots, outSlots: slots })]));
    const request = start();
    await reply(request, definition("done", { inSlots: requestedSlots, outSlots: requestedSlots, params: requestedParams }));
    const configured = current.graph.nodes[0].data;
    // Reference semantics use the original strict first-match lookup, not the new index.
    const expectedSlots = requestedSlots.map((requested) => {
        const existing = slots.find((slot) => slot.key === requested.key &&
            String(slot.type || "").trim().toLowerCase() === String(requested.type || "").trim().toLowerCase());
        return {
            ...requested, key: requested.key || "", type: requested.type || "Unknown",
            description: requested.description ?? existing?.description ?? "",
            path: existing?.path || "", inherited: existing?.inherited || null,
        };
    });
    const expectedParams = requestedParams.map((requested) => {
        const existing = params.find((param) => param.key === requested.key);
        return {
            ...requested, key: requested.key || "", type: requested.type || existing?.type || "Unknown",
            required: Boolean(requested.required), default: requested.default,
            description: requested.description ?? existing?.description ?? "", expr: existing?.expr ?? "",
        };
    });
    assert.deepEqual(configured.inSlots, expectedSlots);
    assert.deepEqual(configured.outSlots, expectedSlots);
    assert.deepEqual(configured.params, expectedParams);
    assert.equal(configured.inSlots[0].path, "/first");
    assert.equal(configured.inSlots[0].inherited, inherited);
    assert.deepEqual(configured.params.map((param) => param.expr), [0, false, "", "", "", ""]);
    assert.deepEqual(configured.events.map((event) => event.id), ["done", "fatal", "*"]);
});

test("omitted fields remain unchanged while explicit empty or null request lists remove entries", async () => {
    await open(workflow("a", [skill("skill", { sensors: ["original"], actuators: ["original"] })]));
    const before = current.graph.nodes[0].data;
    await reply(start(), { actuator: ["singular"], actuators: ["plural"] });
    const after = current.graph.nodes[0].data;
    for (const key of ["events", "params", "inSlots", "outSlots", "sensors"]) assert.equal(after[key], before[key]);
    assert.deepEqual(after.actuators, ["singular"]);
    await reply(start(), { inSlots: null, outSlots: [], params: null, sensors: [], actuators: [] });
    const emptied = current.graph.nodes[0].data;
    for (const key of ["inSlots", "outSlots", "params", "sensors", "actuators"]) assert.deepEqual(emptied[key], []);
    assert.equal(emptied.events, before.events);
    await flushFrames();
    assert.equal(slotCalls.length, 1, "changed consumed parameter shape from reconciliation must not veto its own frame");
});

for (const size of [96, 384]) {
    test(`indexed slot and parameter work is deterministically linear for ${size} reversed requests`, async () => {
        const reads = { currentSlot: 0, requestedSlot: 0, currentParam: 0, requestedParam: 0 };
        const counted = (entry, bucket) => Object.defineProperties(entry, {
            key: { enumerable: true, get: () => { reads[bucket] += 1; return entry.id; } },
            type: { enumerable: true, get: () => { reads[bucket] += 1; return "String"; } },
        });
        const slots = Array.from({ length: size }, (_, id) => counted({ id: `s${id}`, path: `/s${id}` }, "currentSlot"));
        const params = Array.from({ length: size }, (_, id) => counted({ id: `p${id}`, expr: `value${id}` }, "currentParam"));
        const requestedSlots = slots.map((slot) => counted({ id: slot.id }, "requestedSlot")).reverse();
        const requestedParams = params.map((param) => counted({ id: param.id }, "requestedParam")).reverse();
        await open(workflow("a", [skill("skill", { inSlots: slots, params })]));
        const request = start();
        for (const key of Object.keys(reads)) reads[key] = 0;
        await reply(request, { inSlots: requestedSlots, params: requestedParams });
        assert.equal(reads.currentSlot, 2 * size, "each current slot key and normalized type is indexed once");
        assert.equal(reads.requestedSlot, 6 * size, "each requested slot has fixed lookup/spread/fallback work");
        assert.ok(reads.currentParam <= 4 * size, `current parameter reads must be linear: ${reads.currentParam}`);
        assert.ok(reads.requestedParam <= 6 * size, `requested parameter reads must be linear: ${reads.requestedParam}`);
        assert.equal(current.graph.nodes[0].data.inSlots[0].path, `/s${size - 1}`);
        assert.equal(current.graph.nodes[0].data.params[0].expr, `value${size - 1}`);
    });
}
