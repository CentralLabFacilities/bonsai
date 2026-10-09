import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode, useLayoutEffect, useState } from "react";
import { Window } from "happy-dom";
import { isSlotDeletionProtected } from "../src/utils/editorGraph.js";
import { buildRustEditorExportRequest, buildRustSlotsSnapshot } from "../src/utils/scxmlRustExport.js";

const window = new Window({ url: "http://localhost/" });
const originals = new Map();
const frames = new Map();
const noop = () => {};
let frameId = 0;
let hooks;
let CanvasContextMenu;
let createRoot;
let server;
let root;
let container;
let pane;
let current;
let mounted;
let inspect;
let calls;
let nativeRevision;
let nativeDeclarations;
let respond;
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const requirement = (path = "needed", type = "String", access = "read") => ({
    path, type, access, key: "input", state: "pkg.ChildSkill", description: "fixed child metadata",
    subMachinePath: ["Nested"], skillAccesses: [{ skillNodeId: "child-skill", skillName: "pkg.ChildSkill" }],
});
const child = (id = "child", requirements = [requirement()]) => ({
    id, type: "submachine", position: { x: 30, y: 40 },
    data: { label: id, fullSkillName: id, src: "${CHILD}/Child.xml", inheritedSlots: requirements,
        params: [], events: [], inSlots: [], outSlots: [] },
});
const skill = (id = "parent-skill", path = "", type = "String") => ({
    id, type: "custom", position: { x: 1000, y: 1000 },
    data: { label: id, fullSkillName: `pkg.Work#${id}`, params: [], events: [],
        inSlots: [{ key: "input", path, type, metadata: { untouched: true } }], outSlots: [] },
});
const slotNode = (path, data = {}) => ({
    id: `slot-${path}`, type: "slot", position: { x: 1777, y: 1888 },
    data: { path: `/${path}`, label: `/${path}`, slotType: "String", metadata: { untouched: true }, ...data },
});
const model = (nodes = [], manualSlots = [], slotNodes = [], slotEdges = []) => ({
    nodes, manualSlots, slotNodes, slotEdges, edges: [], globalDataModel: [{ id: "parentOnly", expr: "1" }],
    inheritedGlobalDataModel: [],
});
const reply = ({ name, args }) => {
    assert.ok(["replace_active_editor_workflow_document", "apply_workflow_command"].includes(name),
        "drops must not write or modify the child's source file");
    if (name === "replace_active_editor_workflow_document") nativeDeclarations = args.request.extraSlotDeclarations;
    else if (args.command.type === "replaceSlotsSnapshot") nativeDeclarations = args.command.extraSlotDeclarations;
    return Promise.resolve({ revision: ++nativeRevision, patch: {} });
};

function Harness() {
    const graph = hooks.useEditorGraphState();
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const native = hooks.useRustWorkflowDocument(graph);
    // Match App's native lifetime glue, including StrictMode teardown.
    const invalidate = native.invalidate;
    useLayoutEffect(() => () => invalidate(), [invalidate]);
    const tabs = hooks.useWorkflowTabs({ ...graph, selectedNodeId, setSelectedNodeId,
        fitView: noop, getViewport: noop, setViewport: noop, syncRustDocument: native.syncEditorState });
    const slots = hooks.useSlotGraph(graph);
    const connections = hooks.useTransitionGraph({ ...graph, ...slots,
        getActiveDocumentIdentity: tabs.getActiveDocumentIdentity,
        setSelectedNodeId, screenToFlowPosition: (position) => position, flowContainerRef: { current: container },
        updateNodeInternals: noop, selectTransitionEdge: noop, syncTransitionsForSource: noop,
        syncSlotsAfterCommit: native.syncSlotsAfterCommit, cancelFlowConnection: noop, onSlotConnectionError: noop });
    const flow = hooks.useEditorFlowChanges({ ...graph, ...slots,
        nodeById: new Map(graph.nodes.map((node) => [node.id, node])),
        slotNodeIdSet: new Set(graph.slotNodes.map((node) => node.id)), updateNodeInternals: noop,
        syncSlotsAfterCommit: native.syncSlotsAfterCommit, syncRemovedStates: native.syncRemovedStates,
        syncTransitionSources: native.syncTransitionSources });
    const drop = hooks.useEditorLibraryDrop({ ...graph, ...slots,
        activeMode: "overview", getTabSnapshot: tabs.getTabSnapshot,
        getActiveDocumentIdentity: tabs.getActiveDocumentIdentity,
        flowContainerRef: { current: container }, screenToFlowPosition: (position) => position,
        setParallelDropTargetId: noop, setCompoundDropTargetId: noop,
        createBehaviorNode: (...args) => inspect(...args), createNode: async () => skill("new-skill"),
        setSelectedNodeId, syncInsertedEditorStatesAfterCommit: native.syncInsertedEditorStatesAfterCommit,
        syncInsertedParallelLaneStateAfterCommit: native.syncInsertedParallelLaneStateAfterCommit,
        syncSlotsAfterCommit: native.syncSlotsAfterCommit });
    const menu = hooks.useEditorContextMenu({ ...graph, ...flow,
        contextMenu, setContextMenu, selectedNodes: graph.nodes.filter((node) => node.selected),
        activeMode: "overview", behaviorDirectories: [], screenToFlowPosition: (position) => position,
        setSelectedNodeId, selectSlotEdge: noop, selectTransitionEdge: noop, selectEditorNode: noop,
        setRightPanelTab: noop, setActiveTab: noop, setNodeAsInitial: noop, createEditorReference: noop,
        captureGraphSelection: noop, requestGraphPaste: noop, handleOpenTransition: noop,
        handleCreateCompoundFromSelected: noop, handleCreateEmptyCompound: noop,
        handleCreateParallelFromSelected: noop, handleCreateEmptyParallel: noop,
        setPendingSubMachineCreation: noop, setIsCreateSlotModalOpen: noop,
        addEmptyStateToContainer: noop, handleAddLaneToParallel: noop, onEdgeDoubleClick: noop,
        openConditionDrawer: noop, handleNavigateCloneSource: noop, setControlPointInsertRequest: noop,
        updatePersistentEdgeControlPoints: noop, handleOpenSlot: noop, clearAllEdgeSelection: noop,
        getNodes: () => [...graph.getDocumentSnapshot().nodes, ...graph.getDocumentSnapshot().slotNodes], setCenter: noop });
    useLayoutEffect(() => { current = { graph, native, tabs, slots, connections, flow, drop, menu, contextMenu, selectedNodeId }; });
    return createElement(CanvasContextMenu, { contextMenu, activeMode: "overview", hasGraphClipboard: false,
        handleSelectAction: menu.handleSelectAction, onClose: () => setContextMenu(null) });
}

test.before(async () => {
    window.requestAnimationFrame = (callback) => { const id = frameId++; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    window.__TAURI_INTERNALS__ = { invoke: (name, args) => {
        const call = { name, args }; calls.push(call); return respond(call);
    } };
    for (const [name, value] of Object.entries({
        window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    ({ createRoot } = await import("react-dom/client"));
    const { createServer } = await import("vite");
    server = await createServer({ configFile: false, appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] } });
    hooks = Object.assign({}, ...await Promise.all([
        "graph/useEditorGraphState", "document/useWorkflowTabs", "document/useRustWorkflowDocument",
        "graph/useSlotGraph", "graph/useTransitionGraph", "graph/useEditorFlowChanges", "library/useEditorLibraryDrop", "interaction/useEditorContextMenu",
    ].map((name) => server.ssrLoadModule(`/src/hooks/${name}.js`))));
    ({ default: CanvasContextMenu } = await server.ssrLoadModule("/src/components/canvas/CanvasContextMenu.jsx"));
});
test.beforeEach(async () => {
    frames.clear(); calls = []; nativeRevision = 0; nativeDeclarations = []; respond = reply;
    inspect = async () => child();
    container = window.document.createElement("div"); window.document.body.append(container);
    root = createRoot(container); mounted = true;
    await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
    pane = window.document.createElement("div"); pane.className = "react-flow__pane"; container.append(pane);
    container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10000, bottom: 10000, width: 10000, height: 10000 });
    window.document.elementFromPoint = () => pane;
});
test.afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    container.remove(); frames.clear(); await window.happyDOM.cancelAsync();
});
test.after(async () => {
    await server?.close(); await window.happyDOM.cancelAsync();
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    }
});
const seed = async (snapshot = model()) => {
    await act(async () => {
        current.graph.replaceDocument(snapshot);
        current.slots.checkSlotConnection();
    });
    await act(async () => current.native.syncEditorState());
    calls.length = 0;
};
const advanceFrame = async () => act(async () => {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(16); }
});
const flushFrames = async () => {
    for (let index = 0; index < 20 && frames.size; index += 1) await advanceFrame();
    assert.equal(frames.size, 0, "all owned/native commit barriers settled");
};
const dropEvent = (position = { x: 100, y: 100 }) => ({
    preventDefault: noop, clientX: position.x, clientY: position.y,
    dataTransfer: { getData: (key) => key === "behavior" ? JSON.stringify({ source: "${CHILD}/Child.xml", name: "Child.xml" }) : "" },
});
const dropChild = async (position) => {
    let accepted;
    await act(async () => { accepted = await current.drop.handleLibraryDrop(dropEvent(position)); });
    return accepted;
};
const openSlotMenu = async (id) => act(async () => current.menu.handleContextMenuOpen({
    preventDefault: noop, stopPropagation: noop, clientX: 10, clientY: 10,
}, current.graph.getDocumentSnapshot().slotNodes.find((node) => node.id === id)));

test("slot deletion policy distinguishes canonical parent inheritance, fixed children and visual aliases", () => {
    for (const data of [{ currentMachineInherited: true }, { inherited: true }, { slotKind: "inheritSlot" },
        { requiredByChildren: [{ childNodeId: "child" }] }, { requiredByChild: true }]) {
        assert.equal(isSlotDeletionProtected(slotNode("a", data)), true);
        assert.equal(isSlotDeletionProtected(slotNode("a", { ...data, isSlotClone: true, cloneOfNodeId: "slot-a" })), false);
    }
    assert.equal(isSlotDeletionProtected(slotNode("a"), model([], [{ path: "/a", slotKind: "inheritSlot" }])), true);
    assert.equal(isSlotDeletionProtected(slotNode("a"), model([child("child", [requirement("a")])])), true);
    assert.equal(isSlotDeletionProtected(slotNode("a")), false);
});

const compound = { id: "compound", type: "compound", position: { x: 0, y: 0 },
    style: { width: 800, height: 800 }, data: { label: "Compound", events: [] } };
const parallel = { id: "parallel", type: "parallel", position: { x: 0, y: 0 },
    style: { width: 800, height: 850 }, data: { label: "Parallel", lanes: ["Lane"] } };
const lane = { id: "lane", type: "parallelLane", parentId: "parallel", position: { x: 0, y: 40 },
    style: { width: 800, height: 700 }, data: { label: "Lane", events: [] } };
const wrapper = { ...compound, id: "wrapper", parentId: "lane", position: { x: 25, y: 25 },
    style: { width: 600, height: 500 }, data: { label: "Wrapper", events: [], autoParallelLaneCompound: true } };
for (const [name, nodes, parentId, nativeType] of [
    ["root", [], undefined, "insertEditorStates"], ["compound", [compound], "compound", "insertEditorStates"],
    ["parallel lane", [parallel, lane], "lane", "reconcileParallelLane"],
    ["parallel lane wrapper", [parallel, lane, wrapper], "wrapper", "insertEditorStates"],
]) {
    test(`dropping a sourced child at ${name} creates normal parent declarations and sends them after insertion`, async () => {
        const requirements = Object.freeze([Object.freeze(requirement()), Object.freeze(requirement("unresolved", "Unknown", null))]);
        const source = Object.freeze({ ...child("source-child", requirements), data: Object.freeze(child("source-child", requirements).data) });
        inspect = async () => ({ ...source });
        await seed(model(nodes));
        assert.equal(await dropChild(), true);
        const snapshot = current.graph.getDocumentSnapshot();
        assert.equal(snapshot.nodes.find((node) => node.id === source.id).parentId, parentId);
        assert.equal(snapshot.nodes.find((node) => node.id === source.id).data, source.data);
        assert.equal(snapshot.nodes.find((node) => node.id === source.id).data.src, "${CHILD}/Child.xml");
        assert.deepEqual(snapshot.manualSlots.map(({ path, type, slotKind, inherited }) => ({ path, type, slotKind, inherited })), [
            { path: "/needed", type: "String", slotKind: "slot", inherited: null },
            { path: "/unresolved", type: "Unknown", slotKind: "slot", inherited: null },
        ]);
        assert.equal(calls.length, 0, "native persistence waits for the owned insertion frame");
        const canonical = snapshot.slotNodes.find((node) => node.id === "slot-needed");
        assert.equal(canonical.data.currentMachineInherited, false);
        assert.equal(canonical.data.inherited, false);
        assert.equal(canonical.deletable, false, "fixed child path must remain declared");
        assert.equal(snapshot.slotNodes.find((node) => node.id === "slot-unresolved").data.slotType, "Unknown");
        assert.equal(snapshot.slotEdges.length, 1, "unresolved access stays metadata-only");
        assert.equal(snapshot.slotEdges[0].deletable, false);
        await flushFrames();
        const commands = calls.filter(({ name }) => name === "apply_workflow_command").map(({ args }) => args.command);
        assert.ok(commands.some(({ type }) => type === nativeType));
        assert.equal(commands.at(-1).type, "replaceSlotsSnapshot");
        assert.deepEqual(nativeDeclarations, buildRustSlotsSnapshot(current.graph.getDocumentSnapshot()).extraSlotDeclarations);
        const exported = buildRustEditorExportRequest(current.graph.getDocumentSnapshot());
        assert.deepEqual(exported.extraSlotDeclarations, [
            { key: "", state: "", xpath: "/needed", inherited: false },
            { key: "", state: "", xpath: "/unresolved", inherited: false },
        ]);
        const exportedChild = exported.nodes.find((node) => node.id === source.id);
        assert.equal(exportedChild.source, source.data.src);
        assert.deepEqual(exportedChild.inputSlots, []);
        assert.deepEqual(exportedChild.outputSlots, []);
        assert.equal(source.data.inheritedSlots, requirements);
        assert.equal(source.position.x, 30, "the inspected source template is not repositioned");
    });
}

test("reuse manual, skill-bound and derived paths without type, position, metadata or clone overwrites", async () => {
    const declaration = { id: "existing", path: "/manual", type: "Integer", metadata: { keep: true } };
    const parent = skill("parent", "/bound", "Integer");
    const derived = slotNode("derived", { slotType: "Integer" });
    const alias = { ...slotNode("derived"), id: "alias", position: { x: 2000, y: 2200 },
        data: { ...derived.data, isSlotClone: true, cloneOfNodeId: derived.id, aliasMetadata: 7 } };
    await seed(model([parent, child("previous-child", [requirement("derived", "Integer")])],
        [declaration], [slotNode("manual"), slotNode("bound"), derived, alias]));
    inspect = async () => child("child", [requirement("///manual", "String"), requirement("bound", "String"),
        requirement("derived", "String"), requirement("missing", "Integer"), requirement("missing", "Integer", "write")]);
    assert.equal(await dropChild(), true);
    let snapshot = current.graph.getDocumentSnapshot();
    assert.equal(snapshot.manualSlots[0], declaration);
    assert.equal(snapshot.nodes.find((node) => node.id === "parent"), parent);
    assert.deepEqual(snapshot.manualSlots.map(({ path }) => path), ["/manual", "/derived", "/missing"]);
    for (const path of ["manual", "bound", "derived", "missing"]) {
        assert.equal(snapshot.slotNodes.filter((node) => node.id === `slot-${path}`).length, 1);
        assert.equal(snapshot.slotNodes.find((node) => node.id === `slot-${path}`).data.slotType, "Integer");
    }
    assert.deepEqual(snapshot.slotNodes.find((node) => node.id === derived.id).position, derived.position);
    assert.deepEqual(snapshot.slotNodes.find((node) => node.id === "alias").position, alias.position);
    assert.equal(snapshot.slotNodes.find((node) => node.id === "alias").data.aliasMetadata, 7);
    assert.match(current.drop.libraryDropError.message, /\/manual: parent Integer, child String/);
    assert.match(current.drop.libraryDropError.message, /\/bound: parent Integer, child String/);
    assert.match(current.drop.libraryDropError.message, /\/derived: parent Integer, child String/);
    await flushFrames();
    snapshot = current.graph.getDocumentSnapshot();
    assert.equal(nativeDeclarations.filter(({ xpath }) => xpath === "/manual").length, 1);
    assert.equal(snapshot.nodes.find((node) => node.id === "child").data.inheritedSlots[0].type, "String");
});

test("parent inheritance is preserved separately from child requirements and repeated children are idempotent", async () => {
    const inherited = { id: "parent-inherited", path: "/provided", type: "String", slotKind: "inheritSlot",
        inherited: { state: "Grandparent", xpath: "/provided", metadata: "keep" } };
    await seed(model([], [inherited]));
    for (const id of ["first", "second"]) {
        inspect = async () => child(id, [requirement("provided"), requirement("same"), requirement("/same", "String", "write")]);
        assert.equal(await dropChild(), true);
    }
    const snapshot = current.graph.getDocumentSnapshot();
    assert.equal(snapshot.manualSlots.length, 2);
    assert.equal(snapshot.manualSlots[0], inherited);
    assert.equal(snapshot.manualSlots[1].slotKind, "slot");
    assert.equal(snapshot.manualSlots[1].inherited, null);
    const provided = snapshot.slotNodes.find((node) => node.id === "slot-provided");
    assert.equal(provided.data.currentMachineInherited, true);
    assert.equal(provided.data.inheritedFrom, "Grandparent");
    assert.equal(provided.data.requiredByChildren.length, 2);
    assert.equal(snapshot.slotNodes.find((node) => node.id === "slot-same").data.requiredByChildren.length, 4);
    await flushFrames();
    assert.deepEqual(nativeDeclarations.map(({ xpath, inherited }) => ({ xpath, inherited })), [
        { xpath: "/provided", inherited: true }, { xpath: "/same", inherited: false },
    ]);
});

test("an unbound inherited-xpath preview is not mistaken for an exported parent binding", async () => {
    const parent = skill("parent");
    parent.data.inSlots[0].inherited = { state: "Ancestor", xpath: "/needed", metadata: "keep" };
    await seed(model([parent]));
    assert.equal(await dropChild(), true);
    const snapshot = current.graph.getDocumentSnapshot();
    assert.equal(snapshot.manualSlots.length, 1);
    assert.equal(snapshot.manualSlots[0].path, "/needed");
    assert.equal(snapshot.manualSlots[0].slotKind, "slot");
    assert.equal(snapshot.nodes.find((node) => node.id === "parent"), parent);
    assert.equal(snapshot.nodes.find((node) => node.id === "parent").data.inSlots[0].path, "");
    assert.deepEqual(snapshot.nodes.find((node) => node.id === "parent").data.inSlots[0].inherited,
        { state: "Ancestor", xpath: "/needed", metadata: "keep" });
    await flushFrames();
    assert.equal(nativeDeclarations[0].inherited, false);
});

test("resolved child types fill an untyped parent declaration without changing unknown request metadata", async () => {
    const untyped = { path: "/needed", type: "Unknown", metadata: "preserve declaration" };
    const unknownParent = skill("parent", "/needed", "Unknown");
    const unresolved = requirement("unresolved", "Unknown", null);
    await seed(model([unknownParent], [untyped]));
    inspect = async () => child("child", [requirement(), unresolved]);
    assert.equal(await dropChild(), true);
    const snapshot = current.graph.getDocumentSnapshot();
    assert.equal(snapshot.manualSlots[0], untyped);
    assert.equal(snapshot.nodes.find((node) => node.id === "parent"), unknownParent);
    assert.equal(snapshot.slotNodes.find((node) => node.id === "slot-needed").data.slotType, "String");
    assert.equal(snapshot.slotNodes.find((node) => node.id === "slot-unresolved").data.slotType, "Unknown");
    assert.equal(snapshot.nodes.find((node) => node.id === "child").data.inheritedSlots[1], unresolved);
    await flushFrames();
    inspect = async () => child("conflicting", [requirement("needed", "Integer")]);
    assert.equal(await dropChild(), true);
    assert.match(current.drop.libraryDropError.message, /parent String, child Integer/);
    assert.equal(current.graph.slotNodes.find((node) => node.id === "slot-needed").data.slotType, "String");
    assert.equal(current.graph.manualSlots[0], untyped);
    await flushFrames();
});

const createDefaultAfterChildDrop = async () => {
    await seed(model([skill("parent")]));
    assert.equal(await dropChild(), true);
    await flushFrames();
    const childBefore = current.graph.nodes.find((node) => node.id === "child");
    await act(async () => current.connections.handleConnectStart(null, { nodeId: "parent", handleId: "slot-skill-read-0" }));
    await act(async () => assert.equal(current.connections.handleConnectEnd({
        type: "mouseup", button: 0, clientX: 500, clientY: 600,
    }, { isValid: false }), true));
    await flushFrames();
    return childBefore;
};
const requestAutomaticRename = async () => act(async () => current.connections.onConnect({
    source: "slot-defaultslot", sourceHandle: "slot-node-read",
    target: "child", targetHandle: "slot-submachine-read-0",
}));

test("real child drop, default-slot draw and confirmed rename coalesce only the automatic requirement declaration", async () => {
    const childBefore = await createDefaultAfterChildDrop();
    const automatic = current.graph.manualSlots.find((slot) => slot.path === "/needed");
    assert.equal(automatic.createdForChildRequirements, true);
    const chosen = current.graph.manualSlots.find((slot) => slot.path === "/defaultslot");
    await requestAutomaticRename();
    const pending = current.connections.pendingSlotRename;
    assert.ok(pending);
    assert.equal(pending.plan.declarations[0].id, chosen.id, "original declaration records remain in the guarded plan");
    assert.equal(pending.plan.coalescedDeclarations[0].slot, automatic);
    assert.ok(pending.plan.signature.includes(automatic.id), "automatic target declaration is also signature-protected");
    await act(async () => assert.equal(current.connections.confirmSlotRename(pending.id), true));
    const after = current.graph.getDocumentSnapshot();
    assert.equal(after.nodes.find((node) => node.id === "child"), childBefore);
    assert.equal(after.manualSlots.length, 1);
    assert.equal(after.manualSlots[0].id, chosen.id);
    assert.equal(after.manualSlots[0].path, "/needed");
    assert.equal(after.nodes.find((node) => node.id === "parent").data.inSlots[0].path, "/needed");
    assert.equal(after.slotNodes.filter((node) => node.id === "slot-needed").length, 1);
    assert.deepEqual(after.slotNodes.find((node) => node.id === "slot-needed").position, { x: 500, y: 600 });
    await flushFrames();
    assert.deepEqual(nativeDeclarations.map(({ xpath, inherited }) => ({ xpath, inherited })), [{ xpath: "/needed", inherited: false }]);
});

test("automatic requirement declaration changes invalidate rename approval without edits", async () => {
    await createDefaultAfterChildDrop();
    await requestAutomaticRename();
    const pending = current.connections.pendingSlotRename;
    assert.ok(pending);
    await act(async () => current.graph.setManualSlots((slots) => slots.map((slot) => slot.path === "/needed"
        ? { ...slot, metadata: "edited after approval opened" } : slot)));
    const before = current.graph.getDocumentSnapshot(); calls.length = 0;
    await act(async () => assert.equal(current.connections.confirmSlotRename(pending.id), false));
    assert.equal(current.graph.getDocumentSnapshot(), before);
    assert.equal(calls.length, 0);
});

test("an automatic untyped requirement declaration can coalesce after its child resolves a known type", async () => {
    await seed(model([skill("parent")]));
    await act(async () => current.graph.setSlotNodes([slotNode("needed", { slotType: "Unknown" })]));
    assert.equal(await dropChild(), true);
    assert.equal(current.graph.manualSlots[0].type, "Unknown");
    assert.equal(current.graph.slotNodes[0].data.slotType, "String");
    await flushFrames();
    await act(async () => current.connections.handleConnectStart(null, { nodeId: "parent", handleId: "slot-skill-read-0" }));
    await act(async () => assert.equal(current.connections.handleConnectEnd({
        type: "mouseup", button: 0, clientX: 500, clientY: 600,
    }, { isValid: false }), true));
    await flushFrames();
    await requestAutomaticRename();
    const pending = current.connections.pendingSlotRename;
    assert.ok(pending);
    await act(async () => assert.equal(current.connections.confirmSlotRename(pending.id), true));
    assert.equal(current.graph.manualSlots.length, 1);
    assert.equal(current.graph.manualSlots[0].type, "String");
    assert.equal(current.graph.manualSlots[0].path, "/needed");
    await flushFrames();
});

test("automatic target still rejects real bindings, manual ownership, aliases, incompatible types and other children", async () => {
    for (const change of ["binding", "manual", "owner", "inherited", "alias", "type", "child"]) {
        await createDefaultAfterChildDrop();
        await act(async () => {
            if (change === "binding") current.graph.setNodes((nodes) => [...nodes, skill("other", "/needed")]);
            else if (change === "child") current.graph.setNodes((nodes) => [...nodes, child("other-child")]);
            else if (change === "alias") current.graph.setSlotNodes((nodes) => [...nodes, {
                ...slotNode("needed"), id: "required-alias", data: { ...slotNode("needed").data, isSlotClone: true, cloneOfNodeId: "slot-needed" },
            }]);
            else current.graph.setManualSlots((slots) => slots.map((slot) => slot.path !== "/needed" ? slot : {
                ...slot,
                ...(change === "manual" ? { createdForChildRequirements: false } : {}),
                ...(change === "owner" ? { state: "explicit-owner", key: "explicit-key" } : {}),
                ...(change === "inherited" ? { slotKind: "inheritSlot" } : {}),
                ...(change === "type" ? { type: "Integer" } : {}),
            }));
        });
        const before = current.graph.getDocumentSnapshot(); calls.length = 0;
        await requestAutomaticRename();
        assert.equal(current.connections.pendingSlotRename, null, change);
        assert.equal(current.graph.getDocumentSnapshot(), before, change);
        assert.equal(calls.length, 0, change);
    }
});

test("live snapshots rebase unrelated edits after inspection and after both owned/native frames", async () => {
    const inspection = deferred(); inspect = () => inspection.promise;
    await seed(model([skill("unrelated")]));
    let pending;
    await act(async () => { pending = current.drop.handleLibraryDrop(dropEvent()); });
    await act(async () => {
        current.graph.setNodes((nodes) => nodes.map((node) => ({ ...node, data: { ...node.data, label: "edited during inspection" } })));
        current.graph.setManualSlots([{ path: "/unrelated", type: "String", metadata: 1 }]);
        inspection.resolve(child());
        assert.equal(await pending, true);
    });
    await advanceFrame();
    await act(async () => {
        current.graph.setNodes((nodes) => nodes.map((node) => node.id === "unrelated"
            ? { ...node, data: { ...node.data, label: "edited during native wait" } } : node));
        current.graph.setManualSlots((slots) => [...slots, { path: "/later", type: "String", metadata: 2 }]);
        current.graph.setSlotNodes((nodes) => nodes.map((node) => node.id === "slot-needed"
            ? { ...node, position: { x: 4321, y: 5432 } } : node));
    });
    await advanceFrame();
    await advanceFrame();
    await act(async () => current.graph.setManualSlots((slots) => [...slots, { path: "/at-persist", type: "String", metadata: 3 }]));
    await flushFrames();
    const snapshot = current.graph.getDocumentSnapshot();
    assert.equal(snapshot.nodes.find((node) => node.id === "unrelated").data.label, "edited during native wait");
    assert.deepEqual(snapshot.slotNodes.find((node) => node.id === "slot-needed").position, { x: 4321, y: 5432 });
    assert.deepEqual(nativeDeclarations.map(({ xpath }) => xpath), ["/unrelated", "/needed", "/later", "/at-persist"]);
    assert.equal(snapshot.manualSlots[0].metadata, 1);
    assert.equal(snapshot.manualSlots[2].metadata, 2);
    assert.equal(snapshot.manualSlots[3].metadata, 3);
});

for (const change of ["switch", "switch-back", "replace", "reopen", "unmount"]) {
    test(`late inspection is harmless after ${change}`, async () => {
        await seed();
        const inspection = deferred(); inspect = () => inspection.promise;
        let pending;
        await act(async () => { pending = current.drop.handleLibraryDrop(dropEvent()); });
        const origin = current.tabs.getTabSnapshot();
        await act(async () => {
            if (change === "unmount") { root.unmount(); mounted = false; }
            else if (change === "replace") current.tabs.replaceTabDocument(origin.id, model([skill("replacement")]));
            else {
                current.tabs.openTab({ ...model([skill("other")]), id: "other-tab", title: "Other" }, { fit: false });
                if (change === "switch-back") current.tabs.switchTab(origin.id);
                if (change === "reopen") {
                    current.tabs.closeTab(origin.id);
                    current.tabs.openTab({ ...model([skill("reopened")]), id: origin.id, title: "Reopened" }, { fit: false });
                }
            }
        });
        const before = current.graph.getDocumentSnapshot();
        calls.length = 0;
        await act(async () => { inspection.resolve(child()); assert.equal(await pending, false); });
        await flushFrames();
        assert.equal(current.graph.getDocumentSnapshot(), before);
        assert.equal(current.drop.libraryDropError, null);
        assert.ok(!calls.some(({ args }) => args.command?.type === "insertEditorStates" || args.command?.type === "replaceSlotsSnapshot"));
    });
}

test("owned frames fence switch-back, source replacement and canceled callbacks after unmount", async () => {
    for (const change of ["switch-back", "source", "unmount"]) {
        await seed(); inspect = async () => child();
        assert.equal(await dropChild(), true);
        const scheduled = [...frames.values()];
        const originId = current.tabs.getTabSnapshot().id;
        await act(async () => {
            if (change === "switch-back") {
                current.tabs.openTab({ ...model(), id: "other-tab", title: "Other" }, { fit: false });
                current.tabs.switchTab(originId);
            } else if (change === "source") {
                current.graph.setNodes((nodes) => nodes.map((node) => node.id === "child"
                    ? { ...node, data: { ...node.data, src: "different.xml" } } : node));
            } else { root.unmount(); mounted = false; }
        });
        calls.length = 0;
        const before = current.graph.getDocumentSnapshot();
        await act(async () => { scheduled.forEach((callback) => callback(16)); });
        await flushFrames();
        assert.equal(current.graph.getDocumentSnapshot(), before);
        assert.ok(!calls.some(({ args }) => args.command?.type === "insertEditorStates" || args.command?.type === "replaceSlotsSnapshot"));
    }
});

test("unmount invalidates already-enqueued native insertion before its own commit barrier", async () => {
    await seed(); assert.equal(await dropChild(), true);
    await advanceFrame();
    assert.equal(calls.length, 0);
    assert.ok(frames.size > 0, "native insertion is waiting for React's commit");
    await act(async () => root.unmount()); mounted = false;
    await flushFrames();
    assert.equal(calls.length, 0);
});

test("unmount invalidates already-enqueued native slot synchronization without dropping local declarations", async () => {
    await seed(); assert.equal(await dropChild(), true);
    await advanceFrame();
    await advanceFrame();
    await advanceFrame();
    const before = current.graph.getDocumentSnapshot();
    assert.ok(calls.some(({ args }) => args.command?.type === "insertEditorStates"));
    assert.ok(!calls.some(({ args }) => args.command?.type === "replaceSlotsSnapshot"));
    assert.ok(frames.size > 0, "native slot synchronization is waiting for React's commit");
    const previousCallCount = calls.length;
    await act(async () => root.unmount()); mounted = false;
    await flushFrames();
    assert.equal(calls.length, previousCallCount);
    assert.equal(current.graph.getDocumentSnapshot(), before);
    assert.equal(before.manualSlots[0].path, "/needed");
});

test("StrictMode unmount fences queued configuration while a fresh App instance cold-initializes another document", async () => {
    await seed(model([skill("old-owner")]));
    const oldNative = current.native;
    let oldOperation;
    await act(async () => { oldOperation = oldNative.syncStateConfigurationAfterCommit("old-owner"); });
    assert.ok(frames.size > 0);
    await act(async () => root.unmount()); mounted = false;
    container.remove();
    container = window.document.createElement("div"); window.document.body.append(container);
    root = createRoot(container); mounted = true;
    await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
    await act(async () => current.graph.replaceDocument(model([skill("new-owner")])));
    let newOperation;
    await act(async () => { newOperation = current.native.syncStateConfigurationAfterCommit("new-owner"); });
    calls.length = 0;
    await flushFrames();
    assert.equal(await oldOperation, null);
    assert.ok(await newOperation);
    const initialization = calls.find(({ name }) => name === "replace_active_editor_workflow_document");
    assert.deepEqual(initialization.args.request.nodes.map(({ id }) => id), ["new-owner"]);
    assert.equal(initialization.args.expectedRevision, null);
    const commands = calls.filter(({ name }) => name === "apply_workflow_command").map(({ args }) => args.command);
    assert.deepEqual(commands.map(({ type }) => type), ["replaceStateParameters", "replaceSlotsSnapshot"]);
    assert.equal(commands[0].stateId, "new-owner");
    assert.deepEqual(commands[1].states.map(({ stateId }) => stateId), ["new-owner"]);
    assert.equal(oldNative.getRevision(), null, "the old lifetime cannot publish or restore readiness");
    assert.ok(current.native.getRevision() > 0);
    assert.equal(current.graph.nodes[0].id, "new-owner");
    calls.length = 0;
    assert.equal(await dropChild(), true);
    await flushFrames();
    assert.ok(calls.some(({ args }) => args.command?.type === "insertEditorStates"));
    assert.ok(calls.some(({ args }) => args.command?.type === "replaceSlotsSnapshot"));
    assert.equal(oldNative.getRevision(), null);
});

test("rejected inspections after switch or unmount cannot publish an old document's error", async () => {
    await seed();
    const inspection = deferred(); inspect = () => inspection.promise;
    let pending;
    await act(async () => { pending = current.drop.handleLibraryDrop(dropEvent()); });
    await act(async () => current.tabs.openTab({ ...model(), id: "other-tab", title: "Other" }, { fit: false }));
    await act(async () => { inspection.reject(new Error("old child error")); assert.equal(await pending, false); });
    assert.equal(current.drop.libraryDropError, null);
});

test("keyboard/programmatic mixed deletion keeps protected declarations and bindings while deleting normal paths", async () => {
    const inherited = { path: "/protected", type: "String", slotKind: "inheritSlot", inherited: { state: "Grandparent" } };
    const normal = { path: "/normal", type: "String" };
    await seed(model([skill("protected-skill", "/protected"), skill("normal-skill", "/normal"), child("child", [requirement("required")])],
        [inherited, normal, { path: "/required", type: "String" }]));
    const before = current.graph.getDocumentSnapshot();
    const protectedEdge = before.slotEdges.find((edge) => edge.data.path === "protected");
    await act(async () => {
        current.flow.handleNodesChange(["slot-protected", "slot-required", "slot-normal"].map((id) => ({ id, type: "remove" })));
        current.flow.handleVisibleEdgesChange(before.slotEdges.map(({ id }) => ({ id, type: "remove" })));
    });
    const after = current.graph.getDocumentSnapshot();
    assert.equal(after.manualSlots[0], inherited);
    assert.deepEqual(after.manualSlots.map(({ path }) => path), ["/protected", "/required"]);
    assert.equal(after.nodes.find((node) => node.id === "protected-skill"), before.nodes[0]);
    assert.equal(after.nodes.find((node) => node.id === "normal-skill").data.inSlots[0].path, "");
    assert.equal(after.nodes.find((node) => node.id === "child"), before.nodes[2]);
    assert.ok(after.slotNodes.some((node) => node.id === "slot-protected"));
    assert.ok(after.slotNodes.some((node) => node.id === "slot-required"));
    assert.ok(!after.slotNodes.some((node) => node.id === "slot-normal"));
    assert.equal(after.slotEdges.find((edge) => edge.id === protectedEdge.id), protectedEdge);
    assert.equal(after.slotEdges.length, 2);
    await flushFrames();
    assert.deepEqual(nativeDeclarations.map(({ xpath }) => xpath), ["/protected", "/required"]);
});

test("live flags and inherited declarations veto stale captured remove handlers with zero semantic mutation", async () => {
    for (const data of [{ currentMachineInherited: true }, { inherited: true }, { slotKind: "inheritSlot" },
        { requiredByChildren: [{ childNodeId: "child" }] }]) {
        await seed(model([skill("parent", "/a")], [{ path: "/a", type: "String" }]));
        const remove = current.flow.handleNodesChange;
        let before;
        await act(async () => {
            current.graph.setSlotNodes((nodes) => nodes.map((node) => ({ ...node, data: { ...node.data, ...data } })));
            before = current.graph.getDocumentSnapshot();
            remove([{ id: "slot-a", type: "remove" }]);
        });
        assert.equal(current.graph.getDocumentSnapshot(), before);
        assert.equal(calls.length, 0);
    }
    await seed(model([skill("parent", "/a")], [{ path: "/a", type: "String" }]));
    const remove = current.flow.handleNodesChange;
    let before;
    await act(async () => {
        current.graph.setManualSlots((slots) => slots.map((slot) => ({ ...slot, slotKind: "inheritSlot" })));
        before = current.graph.getDocumentSnapshot();
        remove([{ id: "slot-a", type: "remove" }]);
    });
    assert.equal(current.graph.getDocumentSnapshot(), before);
    assert.equal(calls.length, 0);
});

test("fixed child edges and selected inherited slot edges cannot be removed before the node deletion callback", async () => {
    await seed(model([skill("parent", "/a"), child("child", [requirement("fixed")])],
        [{ path: "/a", slotKind: "inheritSlot", type: "String" }, { path: "/fixed", type: "String" }]));
    await act(async () => current.graph.setSlotNodes((nodes) => nodes.map((node) => node.id === "slot-a" ? { ...node, selected: true } : node)));
    const before = current.graph.getDocumentSnapshot();
    await act(async () => {
        current.flow.handleVisibleEdgesChange(before.slotEdges.map(({ id }) => ({ id, type: "remove" })));
        current.flow.handleNodesChange(["slot-a", "slot-fixed"].map((id) => ({ id, type: "remove" })));
    });
    assert.equal(current.graph.getDocumentSnapshot(), before);
    assert.equal(calls.length, 0);
});

test("context menu disables canonical Delete, rechecks stale callbacks and leaves alias-only deletion available", async () => {
    const inherited = { path: "/a", type: "String", slotKind: "inheritSlot" };
    const canonical = slotNode("a");
    const alias = { ...slotNode("a"), id: "alias", data: { ...canonical.data, isSlotClone: true, cloneOfNodeId: canonical.id } };
    await seed(model([skill("parent", "/a")], [inherited], [canonical, alias]));
    await openSlotMenu("slot-a");
    const button = [...window.document.querySelectorAll(".context-menu button")].find((button) => button.textContent === "Delete");
    assert.ok(button.disabled);
    assert.equal(button.getAttribute("aria-disabled"), "true");
    assert.match(button.title, /inherited.*required/);
    const before = current.graph.getDocumentSnapshot();
    await act(async () => current.menu.handleSelectAction("delete-node"));
    assert.equal(current.graph.getDocumentSnapshot(), before);
    await openSlotMenu("alias");
    assert.equal([...window.document.querySelectorAll(".context-menu button")].find((button) => button.textContent === "Delete").disabled, false);
    await act(async () => current.menu.handleSelectAction("delete-node"));
    assert.ok(!current.graph.slotNodes.some((node) => node.id === "alias"));
    assert.ok(current.graph.slotNodes.some((node) => node.id === "slot-a"));
    assert.equal(current.graph.manualSlots[0], inherited);

    await seed(model([skill("parent", "/b")], [{ path: "/b", type: "String" }]));
    await openSlotMenu("slot-b");
    const staleDelete = current.menu.handleSelectAction;
    await act(async () => current.graph.setManualSlots((slots) => slots.map((slot) => ({ ...slot, slotKind: "inheritSlot" }))));
    const latest = current.graph.getDocumentSnapshot();
    assert.equal([...window.document.querySelectorAll(".context-menu button")].find((button) => button.textContent === "Delete").disabled, true);
    await act(async () => staleDelete("delete-node"));
    assert.equal(current.graph.getDocumentSnapshot(), latest);
    assert.equal(calls.length, 0);
});

test("deleting an inherited slot alias remaps fixed READ/WRITE edges without touching the real declaration", async () => {
    const canonical = slotNode("a");
    const alias = { ...slotNode("a"), id: "alias", data: { ...canonical.data, isSlotClone: true, cloneOfNodeId: canonical.id } };
    await seed(model([child("child", [requirement("a"), requirement("a", "String", "write")])],
        [{ path: "/a", slotKind: "inheritSlot", type: "String" }], [canonical, alias]));
    await act(async () => current.graph.setSlotEdges((edges) => edges.map((edge) => ({ ...edge,
        ...(edge.data.access === "read" ? { source: "alias" } : { target: "alias" }), data: { ...edge.data, slotNodeId: "alias" } }))));
    const before = current.graph.getDocumentSnapshot();
    await act(async () => {
        current.flow.handleNodesChange([{ id: "alias", type: "remove" }]);
        current.flow.handleVisibleEdgesChange(before.slotEdges.map(({ id }) => ({ id, type: "remove" })));
    });
    const after = current.graph.getDocumentSnapshot();
    assert.equal(after.manualSlots, before.manualSlots);
    assert.equal(after.nodes, before.nodes);
    assert.equal(after.slotEdges.length, 2);
    assert.equal(after.slotEdges[0].source, canonical.id);
    assert.equal(after.slotEdges[1].target, canonical.id);
    assert.ok(!after.slotNodes.some((node) => node.id === "alias"));
    assert.equal(calls.length, 0);
});

test("removing a child releases only its fixed-path deletion lock, never clears manual slots by stealth", async () => {
    const declaration = { path: "/a", type: "String" };
    await seed(model([child("child", [requirement("a")])], [declaration]));
    assert.equal(current.graph.slotNodes[0].deletable, false);
    await act(async () => current.flow.handleNodesChange([{ id: "child", type: "remove" }]));
    assert.equal(current.graph.manualSlots[0], declaration);
    assert.equal(current.graph.slotNodes[0].deletable, true);
    assert.equal(current.graph.slotEdges.length, 0);
    await flushFrames();
    assert.deepEqual(nativeDeclarations.map(({ xpath }) => xpath), ["/a"]);
});
