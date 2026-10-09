import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode, useCallback, useLayoutEffect, useState } from "react";
import { Window } from "happy-dom";
import { parseSlotConnectionHandle } from "../src/utils/editorGraph.js";
import { buildRustEditorExportRequest, buildRustSlotsSnapshot, getWorkflowDocumentFingerprint } from "../src/utils/scxmlRustExport.js";

const window = new Window({ url: "http://localhost/" });
const originals = new Map();
let hooks;
let EditorOverlays;
let server;
let createRoot;
let root;
let container;
let canvas;
let pane;
let hit;
let current;
let syncCalls;
let writes;
let errors;
let cancellations;
let mounted;
const noop = () => {};
const skill = (id = "skill", data = {}) => ({
    id, type: "custom", position: { x: 10, y: 20 },
    data: { label: id, fullSkillName: `pkg.Work#${id}`, params: [], events: [],
        inSlots: [{ key: "input", type: "String", path: "", description: "original input", metadata: { keep: true } }],
        outSlots: [{ key: "output", type: "String", path: "" }], ...data },
});
const slot = (path, extra = {}) => ({
    id: `slot-${path}`, type: "slot", position: { x: 400, y: 300 },
    data: { path: `/${path}`, label: `/${path}`, slotType: "String", note: "preserve" }, ...extra,
});
const child = (path = "fixed", data = {}) => ({
    id: "child", type: "submachine", position: { x: 100, y: 20 },
    data: { label: "Child", src: "child.xml", fullSkillName: "pkg.Child", inheritedSlots: [
        { key: "childInput", type: "String", access: "read", path, state: "pkg.ChildSkill",
            skillAccesses: [{ skillNodeId: "nested", skillName: "pkg.ChildSkill", description: "fixed" }], subMachinePath: ["nestedChild"] },
    ], ...data },
});
const model = (nodes = [skill()], manualSlots = [{ id: "manual-a", path: "/a", type: "String", metadata: "keep" }], slotNodes = [slot("a")]) => ({
    nodes, edges: [], slotNodes, slotEdges: [], manualSlots, globalDataModel: [], inheritedGlobalDataModel: [],
});
const connect = (access = "read", reverse = false, slotId = "slot-a", nodeId = "skill", origin = "skill", index = 0) => {
    const connection = { source: nodeId, target: slotId, sourceHandle: `slot-${origin}-${access}-${index}`, targetHandle: `slot-node-${access}` };
    return reverse ? { source: connection.target, target: connection.source, sourceHandle: connection.targetHandle, targetHandle: connection.sourceHandle } : connection;
};
const slotEdge = (access = "read", owner = "skill") => current.graph.getDocumentSnapshot().slotEdges.find((edge) => edge.data.access === access && edge.data.skillNodeId === owner);
const emptyRelease = (type = "mouseup", x = 500, y = 420) => ({ type, clientX: x, clientY: y, button: 0 });

function Harness() {
    const graph = hooks.useEditorGraphState();
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const tabs = hooks.useWorkflowTabs({ ...graph, selectedNodeId, setSelectedNodeId,
        fitView: noop, getViewport: noop, setViewport: noop, syncRustDocument: async () => null });
    const slots = hooks.useSlotGraph(graph);
    const { setNodes: setGraphNodes } = graph;
    const setNodes = useCallback((value) => { writes.push(value); setGraphNodes(value); }, [setGraphNodes]);
    const connections = hooks.useTransitionGraph({ ...graph, setNodes, setSelectedNodeId,
        getActiveDocumentIdentity: tabs.getActiveDocumentIdentity,
        screenToFlowPosition: ({ x, y }) => ({ x: x - 100, y: y - 50 }), flowContainerRef: { current: canvas },
        updateNodeInternals: noop, selectTransitionEdge: noop, syncTransitionsForSource: noop,
        checkSlotConnection: slots.checkSlotConnection,
        syncSlotsAfterCommit: async (snapshot, context) => { syncCalls.push({ snapshot, context, identity: tabs.getActiveDocumentIdentity() }); },
        cancelFlowConnection: () => { cancellations += 1; }, onSlotConnectionError: (message) => errors.push(message),
    });
    const flow = hooks.useEditorFlowChanges({ ...graph, setNodes,
        nodeById: new Map(graph.nodes.map((node) => [node.id, node])), slotNodeIdSet: new Set(graph.slotNodes.map((node) => node.id)),
        updateNodeInternals: noop, syncRemovedStates: noop, syncTransitionSources: noop });
    useLayoutEffect(() => { current = { graph, tabs, slots, connections, flow }; });
    return createElement(EditorOverlays, {
        hint: {}, subMachine: {}, paste: {}, shortcuts: {}, condition: { drawer: {} }, slots: {},
        slotRename: connections.pendingSlotRename && {
            pending: connections.pendingSlotRename, onCancel: connections.cancelSlotRename,
            onConfirm: () => connections.confirmSlotRename(connections.pendingSlotRename.id),
        },
    });
}

test.before(async () => {
    for (const [name, value] of Object.entries({
        window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
        requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    window.document.elementFromPoint = () => hit;
    ({ createRoot } = await import("react-dom/client"));
    const { createServer } = await import("vite");
    server = await createServer({ configFile: false, appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] } });
    hooks = Object.assign({}, ...await Promise.all([
        "graph/useEditorGraphState", "document/useWorkflowTabs", "graph/useSlotGraph", "graph/useTransitionGraph", "graph/useEditorFlowChanges",
    ].map((name) => server.ssrLoadModule(`/src/hooks/${name}.js`))));
    ({ default: EditorOverlays } = await server.ssrLoadModule("/src/components/overlays/EditorOverlays.jsx"));
});
test.beforeEach(async () => {
    syncCalls = []; writes = []; errors = []; cancellations = 0;
    canvas = window.document.createElement("div");
    pane = window.document.createElement("div");
    pane.className = "react-flow__pane";
    canvas.append(pane);
    window.document.body.append(canvas);
    canvas.getBoundingClientRect = () => ({ left: 100, top: 50, right: 900, bottom: 650 });
    hit = pane;
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    mounted = true;
    await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
});
test.afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    container.remove(); canvas.remove();
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
const seed = async (snapshot = model()) => act(async () => {
    current.graph.replaceDocument(snapshot);
    current.slots.checkSlotConnection(snapshot.nodes, snapshot.manualSlots, snapshot.slotNodes, snapshot.slotEdges);
});
const draw = async (connection = connect()) => act(async () => current.connections.onConnect(connection));
const start = async (nodeId = "skill", handleId = "slot-skill-read-0") => act(async () => current.connections.handleConnectStart(null, { nodeId, handleId }));
const release = async (event = emptyRelease(), state = { isValid: false, toNode: null, toHandle: null }) => {
    let applied;
    await act(async () => { applied = current.connections.handleConnectEnd(event, state); });
    return applied;
};
const confirm = async (id = current.connections.pendingSlotRename.id) => {
    let applied;
    await act(async () => { applied = current.connections.confirmSlotRename(id); });
    return applied;
};

test("slot parser retains original indices and distinguishes fixed child requirements", () => {
    assert.deepEqual(parseSlotConnectionHandle("slot-submachine-read-7"), { origin: "submachine", access: "read", inheritIndex: 7 });
    assert.deepEqual(parseSlotConnectionHandle("slot-submachine-write-0"), { origin: "submachine", access: "write", inheritIndex: 0 });
    assert.deepEqual(parseSlotConnectionHandle("slot-node-read"), { origin: "slot", access: "read", slotIndex: null });
    assert.equal(parseSlotConnectionHandle("slot-submachine-inherit-1"), null);
});

test("actual hook accepts either drag start direction and stores real READ/WRITE endpoints", async () => {
    await seed();
    for (const access of ["read", "write"]) {
        for (const reverse of [false, true]) {
            assert.equal(current.connections.isValidConnection(connect(access, reverse)), true);
            await draw(connect(access, reverse));
            const edge = slotEdge(access);
            assert.equal(edge.source, access === "read" ? "slot-a" : "skill");
            assert.equal(edge.target, access === "read" ? "skill" : "slot-a");
            assert.equal(edge.sourceHandle, access === "read" ? "slot-node-read" : "slot-skill-write-0");
            assert.equal(edge.targetHandle, access === "read" ? "slot-skill-read-0" : "slot-node-write");
            assert.equal(edge.data.canonicalSlotNodeId, "slot-a");
            assert.equal(edge.data.skillNodeId, "skill");
            assert.equal(edge.data.slotNodeId, "slot-a");
        }
    }
    const snapshot = current.graph.getDocumentSnapshot();
    assert.equal(snapshot.nodes[0].data.inSlots[0].path, "/a");
    assert.equal(snapshot.nodes[0].data.inSlots[0].description, "original input");
    assert.deepEqual(snapshot.nodes[0].data.inSlots[0].metadata, { keep: true });
    assert.equal(syncCalls.at(-1).snapshot.nodes, snapshot.nodes);
    const invalid = connect("read"); invalid.targetHandle = "slot-node-write";
    assert.equal(current.connections.isValidConnection(invalid), false);
    assert.equal(current.connections.isValidConnection({ ...connect(), target: "skill", targetHandle: "slot-skill-read-0" }), false);
});

test("hook reconnects both canonical and clone ends, preserving edge IDs and unrelated identity", async () => {
    const unrelated = skill("other", { inSlots: [{ key: "other", type: "String", path: "/unrelated" }], outSlots: [] });
    const alias = slot("a", { id: "alias-a", position: { x: 700, y: 410 }, data: { ...slot("a").data, isSlotClone: true, cloneOfNodeId: "slot-a", aliasMetadata: 2 } });
    await seed(model([skill(), unrelated], [
        { path: "/a", type: "String" }, { path: "/b", type: "String" }, { path: "/unrelated", type: "String" },
    ], [slot("a"), slot("b"), slot("unrelated"), alias]));
    const otherEdge = slotEdge("read", "other");
    const otherSlot = current.graph.slotNodes.find((node) => node.id === "slot-unrelated");
    for (const access of ["read", "write"]) {
        await draw(connect(access, true, "alias-a"));
        let edge = slotEdge(access);
        const id = edge.id;
        assert.equal(edge.data.slotNodeId, "alias-a");
        await act(async () => current.connections.onReconnect(edge, connect(access, false, "slot-b")));
        edge = slotEdge(access);
        assert.equal(edge.id, id);
        assert.equal(edge.data.slotNodeId, "slot-b");
        await act(async () => current.connections.onReconnect(edge, connect(access, true, "alias-a")));
        assert.equal(slotEdge(access).id, id);
        assert.equal(slotEdge(access).data.canonicalSlotNodeId, "slot-a");
    }
    assert.equal(current.graph.nodes.find((node) => node.id === "other"), unrelated);
    assert.equal(slotEdge("read", "other"), otherEdge);
    assert.equal(current.graph.slotNodes.find((node) => node.id === "slot-unrelated"), otherSlot);
    assert.deepEqual(current.graph.slotNodes.find((node) => node.id === "alias-a").position, alias.position);
    assert.equal(current.graph.slotNodes.find((node) => node.id === "alias-a").data.aliasMetadata, 2);
});

test("deleting a slot clone remaps READ sources and WRITE targets; deleting edges clears only their binding", async () => {
    const alias = slot("a", { id: "alias", data: { ...slot("a").data, isSlotClone: true, cloneOfNodeId: "slot-a" } });
    await seed(model([skill()], [{ path: "/a", type: "String" }], [slot("a"), alias]));
    await draw(connect("read", false, "alias")); await draw(connect("write", true, "alias"));
    const removedIds = current.graph.slotEdges.map((edge) => edge.id);
    await act(async () => current.flow.handleNodesChange([{ type: "remove", id: "alias" }]));
    assert.equal(slotEdge("read").source, "slot-a");
    assert.equal(slotEdge("write").target, "slot-a");
    await act(async () => current.flow.handleVisibleEdgesChange(removedIds.map((id) => ({ type: "remove", id }))));
    assert.equal(current.graph.nodes[0].data.inSlots[0].path, "/a");
    for (const access of ["read", "write"]) {
        const edge = slotEdge(access);
        await act(async () => current.flow.handleVisibleEdgesChange([{ type: "remove", id: edge.id }]));
        assert.equal(current.graph.nodes[0].data[access === "read" ? "inSlots" : "outSlots"][0].path, "");
    }
    assert.equal(current.graph.manualSlots[0].path, "/a");
});

test("empty release creates a unique typed canonical slot at flow drop position and rebases fresh edits", async () => {
    await seed(model([skill(), skill("other")], [{ path: "/defaultslot", type: "String" }], [slot("defaultslot")]));
    const before = current.graph.getDocumentSnapshot();
    const fingerprint = getWorkflowDocumentFingerprint(before);
    await start();
    assert.equal(current.connections.slotConnectionDrag.previewPath, "/defaultslot2");
    assert.equal(current.connections.slotConnectionDrag.origin, "skill");
    assert.equal(current.connections.slotConnectionDrag.slotIndex, 0);
    assert.equal(current.graph.getDocumentSnapshot(), before);
    assert.equal(getWorkflowDocumentFingerprint(current.graph.getDocumentSnapshot()), fingerprint);
    assert.equal(syncCalls.length, 0);
    await act(async () => {
        current.graph.setNodes((nodes) => nodes.map((node) => node.id === "other" ? { ...node, data: { ...node.data, label: "Live edit" } } : node));
        current.graph.setManualSlots((slots) => [...slots, { path: "/defaultslot2", type: "String" }]);
        current.connections.handleConnectEnd(emptyRelease(), { isValid: false });
    });
    const snapshot = current.graph.getDocumentSnapshot();
    assert.equal(snapshot.nodes[0].data.inSlots[0].path, "/defaultslot3");
    assert.equal(snapshot.nodes[1].data.label, "Live edit");
    assert.deepEqual(snapshot.slotNodes.find((node) => node.id === "slot-defaultslot3").position, { x: 400, y: 370 });
    assert.equal(snapshot.manualSlots.at(-1).type, "String");
    assert.equal(snapshot.manualSlots.at(-1).access, "read");
    assert.equal(slotEdge().source, "slot-defaultslot3");
    assert.equal(current.connections.slotConnectionDrag, null);
    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0].snapshot.nodes, snapshot.nodes);
    assert.equal(syncCalls[0].snapshot.manualSlots, snapshot.manualSlots);
    assert.notEqual(getWorkflowDocumentFingerprint(snapshot), fingerprint);
});

test("WRITE drop and supplied inherited xpath are preserved in the Rust/export snapshot", async () => {
    await seed(model([skill("skill", { outSlots: [{ key: "output", type: "String", path: "", inherited: { state: "parentSkill", xpath: "/provided/path", metadata: "keep" } }] })], [], []));
    await start("skill", "slot-skill-write-0");
    assert.equal(current.connections.slotConnectionDrag.previewPath, "/provided/path");
    assert.equal(await release(), true);
    const snapshot = current.graph.getDocumentSnapshot();
    assert.equal(slotEdge("write").target, "slot-provided/path");
    assert.deepEqual(snapshot.nodes[0].data.outSlots[0].inherited, { state: "parentSkill", xpath: "/provided/path", metadata: "keep" });
    const rust = buildRustSlotsSnapshot(snapshot);
    assert.equal(rust.states[0].outputSlots[0].path, "/provided/path");
    assert.equal(rust.states[0].outputSlots[0].inheritedXpath, "/provided/path");
    assert.equal(rust.extraSlotDeclarations[0].xpath, "/provided/path");
    assert.equal(rust.extraSlotDeclarations[0].inherited, true);
    const exported = buildRustEditorExportRequest(snapshot);
    assert.equal(exported.extraSlotDeclarations[0].xpath, "/provided/path");
    assert.ok(!JSON.stringify(exported).includes("slot-connection-preview"));
});

test("invalid handle, node body, sidebar, outside canvas and slot-origin releases never create", async () => {
    await seed();
    const before = current.graph.getDocumentSnapshot();
    const invalid = window.document.createElement("div"); invalid.className = "react-flow__handle"; pane.append(invalid);
    const nodeBody = window.document.createElement("div"); nodeBody.className = "react-flow__node"; pane.append(nodeBody);
    const sidebar = window.document.createElement("aside"); window.document.body.append(sidebar);
    for (const [target, event, state] of [
        [invalid, emptyRelease(), { isValid: false, toHandle: { id: "slot-node-write" } }],
        [invalid, emptyRelease(), { isValid: false }], [nodeBody, emptyRelease(), { isValid: false }],
        [sidebar, emptyRelease(), { isValid: false }], [pane, emptyRelease("mouseup", 99, 420), { isValid: false }],
        [pane, emptyRelease("touchcancel"), { isValid: false }],
    ]) {
        hit = target;
        await start();
        assert.equal(await release(event, state), false);
        assert.equal(current.graph.getDocumentSnapshot(), before);
    }
    hit = pane;
    await start("slot-a", "slot-node-read");
    assert.equal(current.connections.slotConnectionDrag.canCreate, false);
    assert.equal(await release(), false);
    assert.equal(syncCalls.length, 0);
    sidebar.remove();
});

test("Escape, touch/pointer cancellation, document switch and unmount make late drops harmless", async () => {
    await seed();
    for (const event of [new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        new window.Event("touchcancel", { bubbles: true }), new window.Event("pointercancel", { bubbles: true })]) {
        const before = current.graph.getDocumentSnapshot();
        await start();
        await act(async () => window.document.dispatchEvent(event));
        assert.equal(current.connections.slotConnectionDrag, null);
        assert.equal(await release(), false);
        assert.equal(current.graph.getDocumentSnapshot(), before);
    }
    await start();
    const end = current.connections.handleConnectEnd;
    await act(async () => current.tabs.openTab({ ...model(), id: "next", title: "Next", fileName: "Next.xml" }, { fit: false }));
    const next = current.graph.getDocumentSnapshot();
    assert.equal(await release(), false);
    assert.equal(current.graph.getDocumentSnapshot(), next);
    await start();
    await act(async () => root.unmount()); mounted = false;
    assert.equal(end(emptyRelease(), { isValid: false }), false);
    assert.equal(syncCalls.length, 0);
    assert.ok(cancellations >= 5);
});

test("touchend can create, while valid connections and reconnect empty drops never create defaults", async () => {
    await seed();
    await start(); await draw(connect("read", true));
    assert.equal(await release(emptyRelease(), { isValid: true, toHandle: { id: "slot-node-read" } }), false);
    assert.equal(current.graph.manualSlots.length, 1);
    const edge = slotEdge();
    await act(async () => current.connections.handleReconnectStart(null, edge));
    await start();
    assert.equal(current.connections.slotConnectionDrag.canCreate, false);
    assert.equal(await release(), false);
    await act(async () => current.connections.handleReconnectEnd());
    await start("skill", "slot-skill-write-0");
    assert.equal(await release({ type: "touchend", changedTouches: [{ clientX: 610, clientY: 480 }], touches: [] }), true);
    assert.deepEqual(current.graph.slotNodes.find((node) => node.id === "slot-defaultslot").position, { x: 510, y: 430 });
});

const inheritedFixture = () => {
    const consumer = skill("skill", { inSlots: [{ key: "input", type: "String", path: "/a", metadata: "bound" }],
        outSlots: [{ key: "output", type: "String", path: "/a" }] });
    const unrelated = skill("other", { inSlots: [{ key: "input", type: "String", path: "/elsewhere" }], outSlots: [] });
    const alias = slot("a", { id: "alias-a", position: { x: 700, y: 410 }, data: { ...slot("a").data, isSlotClone: true, cloneOfNodeId: "slot-a" } });
    return model([consumer, child(), unrelated], [
        { id: "declaration-a", path: "/a", type: "String", key: "parentKey", state: "parentState", metadata: "keep" },
        { id: "declaration-elsewhere", path: "/elsewhere", type: "String" },
    ], [slot("a"), slot("elsewhere"), alias]);
};
const requestRename = async (reverse = false, slotId = "slot-a") => draw(connect("read", reverse, slotId, "child", "submachine"));

test("inherited rename confirmation shows only skill names/access while retaining its full guarded plan", async () => {
    await seed(inheritedFixture());
    const before = current.graph.getDocumentSnapshot();
    assert.equal(current.connections.isValidConnection(connect("read", true, "slot-a", "child", "submachine")), true);
    await requestRename(true);
    const pending = current.connections.pendingSlotRename;
    assert.deepEqual(pending.plan.bindings.map(({ access }) => access), ["read", "write"]);
    assert.equal(pending.plan.declarations[0].id, "declaration-a");
    assert.equal(pending.plan.clones[0].id, "alias-a");
    assert.equal(pending.plan.placeholders[0].id, "slot-fixed");
    const dialog = window.document.querySelector("dialog.slot-create-modal-overlay[open]");
    const rows = [...dialog.querySelectorAll(".slot-rename-affected li")];
    assert.deepEqual(rows.map((row) => row.textContent.trim()), ["skill Read", "skill Write"]);
    assert.equal(rows[0].querySelector(".slot-access-read").textContent, "Read");
    assert.equal(rows[1].querySelector(".slot-access-write").textContent, "Write");
    for (const hidden of ["(skill)", "READ input", "WRITE output", "#_SLOTS", "declaration-a", "parentKey", "parentState", "alias-a", "slot-fixed", "unbound child requirement preview", "Visual slot reference"]) {
        assert.equal(dialog.textContent.includes(hidden), false, hidden);
    }
    assert.match(dialog.textContent, /child.xml/);
    assert.equal(window.document.activeElement.textContent, "Cancel");
    await act(async () => dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(current.connections.pendingSlotRename, null);
    assert.equal(current.graph.getDocumentSnapshot(), before);
    assert.equal(await confirm(pending.id), false);
    assert.equal(writes.length, 0); assert.equal(syncCalls.length, 0);
});

test("accepted child connection renames all parent declarations without touching child metadata or unrelated models", async () => {
    await seed(inheritedFixture());
    const before = current.graph.getDocumentSnapshot();
    const childBefore = before.nodes[1];
    const other = before.nodes[2];
    const otherSlot = before.slotNodes.find((node) => node.id === "slot-elsewhere");
    const otherEdge = slotEdge("read", "other");
    const readId = slotEdge().id;
    await requestRename(false, "alias-a");
    await act(async () => current.graph.setNodes((nodes) => nodes.map((node) => node.id === "other"
        ? { ...node, position: { x: 1234, y: 876 } } : node)));
    const freshOther = current.graph.nodes[2];
    assert.equal(await confirm(), true);
    const after = current.graph.getDocumentSnapshot();
    assert.equal(after.nodes[1], childBefore);
    assert.equal(after.nodes[2], freshOther);
    assert.equal(after.nodes[2].data, other.data);
    assert.equal(after.nodes[0].data.inSlots[0].path, "/fixed");
    assert.equal(after.nodes[0].data.outSlots[0].path, "/fixed");
    assert.equal(after.nodes[0].data.inSlots[0].metadata, "bound");
    assert.equal(after.manualSlots[0].path, "/fixed");
    assert.equal(after.manualSlots[0].metadata, "keep");
    assert.equal(after.manualSlots[1], before.manualSlots[1]);
    assert.equal(after.slotNodes.find((node) => node.id === "slot-elsewhere"), otherSlot);
    assert.equal(slotEdge("read", "other"), otherEdge);
    assert.equal(after.slotNodes.filter((node) => node.id === "slot-fixed").length, 1);
    assert.deepEqual(after.slotNodes.find((node) => node.id === "slot-fixed").position, { x: 400, y: 300 });
    const clone = after.slotNodes.find((node) => node.id === "alias-a");
    assert.equal(clone.data.cloneOfNodeId, "slot-fixed");
    assert.deepEqual(clone.position, { x: 700, y: 410 });
    assert.equal(slotEdge().id, readId);
    const childEdge = slotEdge("read", "child");
    assert.equal(childEdge.source, "alias-a"); assert.equal(childEdge.target, "child");
    assert.equal(childEdge.data.subMachineInherited, true);
    assert.equal(childEdge.data.inheritIndex, 0);
    assert.equal(childEdge.data.canonicalSlotNodeId, "slot-fixed");
    const rust = buildRustSlotsSnapshot(after);
    assert.equal(rust.extraSlotDeclarations[0].xpath, "/fixed");
    assert.equal(rust.states.find((state) => state.stateId === "skill").inputSlots[0].path, "/fixed");
    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0].snapshot.nodes, after.nodes);
});

test("multiple bindings of the same skill/access appear once without omitting guarded updates", async () => {
    const initial = inheritedFixture();
    initial.nodes[0].data.inSlots.push({ key: "second-input", type: "String", path: "/a" });
    await seed(initial);
    await requestRename();
    const pending = current.connections.pendingSlotRename;
    assert.equal(pending.plan.bindings.length, 3);
    const dialog = window.document.querySelector("dialog.slot-create-modal-overlay[open]");
    assert.deepEqual([...dialog.querySelectorAll(".slot-rename-affected li")].map((row) => row.textContent.trim()), ["skill Read", "skill Write"]);
    assert.equal(await confirm(), true);
    assert.deepEqual(current.graph.nodes[0].data.inSlots.map((slot) => slot.path), ["/fixed", "/fixed"]);
    assert.equal(current.graph.nodes[0].data.outSlots[0].path, "/fixed");
});

test("same-path inherited connections and WRITE inherited reconnects respect semantic direction", async () => {
    const childNode = child("a", { inheritedSlots: [
        { key: "read", type: "String", access: "read", path: "a" },
        { key: "write", type: "String", access: "write", path: "a" },
    ] });
    const alias = slot("a", { id: "alias", data: { ...slot("a").data, isSlotClone: true, cloneOfNodeId: "slot-a" } });
    await seed(model([childNode], [{ path: "/a", type: "String" }], [slot("a"), alias]));
    await requestRename(true);
    assert.equal(current.connections.pendingSlotRename, null);
    await draw(connect("write", true, "alias", "child", "submachine", 1));
    const edge = slotEdge("write", "child");
    assert.equal(edge.source, "child"); assert.equal(edge.target, "alias");
    await act(async () => current.connections.onReconnect(edge, connect("write", false, "slot-a", "child", "submachine", 1)));
    assert.equal(slotEdge("write", "child").id, edge.id);
    assert.equal(slotEdge("write", "child").target, "slot-a");
    assert.equal(current.graph.nodes[0], childNode);
});

test("inherited rename rejects real path collisions, incompatible bindings and other fixed child requirements", async () => {
    for (const mutate of [
        (fixture) => { fixture.manualSlots.push({ path: "/fixed", type: "String" }); },
        (fixture) => { fixture.nodes.push(skill("collision", { inSlots: [{ key: "x", path: "/fixed", type: "String" }] })); },
        (fixture) => { fixture.nodes[0].data.outSlots[0].type = "Integer"; },
        (fixture) => { fixture.nodes.push({ ...child("a"), id: "secondChild" }); },
        (fixture) => { fixture.nodes[1].data.inheritedSlots[0].type = "Unknown"; },
    ]) {
        const fixture = inheritedFixture(); mutate(fixture); await seed(fixture);
        const before = current.graph.getDocumentSnapshot();
        assert.equal(current.connections.isValidConnection(connect("read", false, "slot-a", "child", "submachine")), false);
        await requestRename();
        assert.equal(current.connections.pendingSlotRename, null);
        assert.equal(current.graph.getDocumentSnapshot(), before);
    }
    assert.equal(syncCalls.length, 0); assert.equal(writes.length, 0);
});

test("confirmations fence source, slot, affected binding/declaration, document generation and activation changes", async () => {
    for (const mutate of [
        () => current.graph.setNodes((nodes) => nodes.map((node) => node.id === "child" ? { ...node, data: { ...node.data, src: "replacement.xml" } } : node)),
        () => current.graph.setNodes((nodes) => nodes.map((node) => node.id === "child" ? { ...node, data: { ...node.data, inheritedSlots: [{ ...node.data.inheritedSlots[0], path: "changed" }] } } : node)),
        () => current.graph.setSlotNodes((nodes) => nodes.map((node) => node.id === "slot-a" ? { ...node, data: { ...node.data, slotType: "Integer" } } : node)),
        () => current.graph.setManualSlots((slots) => slots.map((entry, index) => index ? entry : { ...entry, key: "changed" })),
        () => current.graph.setNodes((nodes) => nodes.map((node) => node.id === "skill" ? { ...node, data: { ...node.data, inSlots: [{ ...node.data.inSlots[0], key: "changed" }] } } : node)),
        () => current.tabs.openTab({ ...model(), id: "other-tab", title: "Other" }, { fit: false }),
    ]) {
        await seed(inheritedFixture()); await requestRename();
        const id = current.connections.pendingSlotRename.id;
        await act(async () => mutate());
        const before = current.graph.getDocumentSnapshot();
        assert.equal(await confirm(id), false);
        assert.equal(current.graph.getDocumentSnapshot(), before);
    }
    assert.equal(syncCalls.length, 0); assert.equal(writes.length, 0);
});

test("manual-only slot graph remains visible and rebuilds retain canonical positions, metadata and identity", async () => {
    const original = slot("only", { position: { x: 12, y: 34 }, data: { ...slot("only").data, customMetadata: { keep: true } } });
    await seed(model([], [{ path: "/only", type: "String" }], [original]));
    assert.equal(current.graph.slotNodes.length, 1);
    assert.deepEqual(current.graph.slotNodes[0].position, original.position);
    assert.deepEqual(current.graph.slotNodes[0].data.customMetadata, { keep: true });
    const generated = current.graph.slotNodes[0];
    await act(async () => current.slots.checkSlotConnection());
    assert.equal(current.graph.slotNodes[0], generated);
});
