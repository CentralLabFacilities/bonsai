import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, StrictMode, Suspense, useLayoutEffect } from "react";
import { Window } from "happy-dom";
import { getWorkflowDocumentFingerprint } from "../src/utils/scxmlRustExport.js";

const window = new Window({ url: "http://localhost/" });
const originals = new Map();
let server;
let createRoot;
let useLiveExecution;
let root;
let container;
let input;
let result;
let identity;
let frames;
let allFrames;
let cancelled;
let nextFrame;
let fits;
let switches;
let mounted;

const skill = (id, name, extra = {}) => ({
    id, type: "custom", position: { x: 10, y: 20 },
    data: { label: name, fullSkillName: name, params: [], events: [] }, ...extra,
});
const wrapper = (id, name, src = "${BEH}/child.xml") => ({
    id, type: "submachine", position: { x: 0, y: 0 },
    data: { label: "Display label is not a scope", fullSkillName: name, src },
});
const documentSnapshot = (id, nodes, extra = {}) => {
    const tab = { id, documentGeneration: 1, nodes, edges: [], slotNodes: [], slotEdges: [],
        manualSlots: [], globalDataModel: [], parentTabId: null, filePath: `/workflows/${id}.xml`,
        includeMapping: { BEH: "/behaviors" }, ...extra };
    const fingerprint = getWorkflowDocumentFingerprint(tab);
    return { ...tab, fingerprint, savedFingerprint: fingerprint, isModified: false };
};
const childSnapshot = (id = "child", nodes = [skill("talk", "dialog.Talk#inside")], extra = {}) =>
    documentSnapshot(id, nodes, { parentTabId: "root", sourcePath: "${BEH}/child.xml",
        filePath: `/behaviors/${(extra.sourcePath || "child.xml").split("/").pop()}`, ...extra });
const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};
const readIdentity = () => identity;
const fitView = (options) => fits.push(options);
const switchTab = (id) => switches.push(id);
function Harness({ options, suspending }) {
    const value = useLiveExecution(options);
    useLayoutEffect(() => { result = value; });
    if (suspending) throw new Promise(() => {});
    return null;
}
const render = (suspending = false) => root.render(createElement(StrictMode, null,
    createElement(Suspense, { fallback: null }, createElement(Harness, { options: input, suspending }))));
const update = async (patch) => act(async () => { input = { ...input, ...patch }; render(); });
const mount = async (workflow, states, children = [], extra = {}) => {
    const tabsSnapshot = freeze([workflow, ...children]);
    identity = { id: workflow.id, documentGeneration: workflow.documentGeneration, activationGeneration: 1 };
    input = {
        liveExecution: { workflow, tabsSnapshot, snapshot: { status: "RUNNING", currentStates: states,
            stateIds: states, transitions: [], checkedAt: 1 }, following: true, followCamera: false },
        tabs: tabsSnapshot, activeTabId: workflow.id, activeDocumentGeneration: workflow.documentGeneration,
        activeFingerprint: workflow.fingerprint, visibleNodes: workflow.nodes, visibleEdges: workflow.edges,
        fitView, switchTab, getActiveDocumentIdentity: readIdentity, ...extra,
    };
    await act(async () => render());
};
const poll = async (snapshot = {}, record = {}) => update({ liveExecution: {
    ...input.liveExecution, ...record, snapshot: { ...input.liveExecution.snapshot,
        checkedAt: (input.liveExecution.snapshot?.checkedAt || 0) + 1, ...snapshot },
} });
const activate = (id) => {
    const tab = input.tabs.find((tab) => tab.id === id);
    assert.ok(tab, `Only an already-open tab may be activated: ${id}`);
    identity = { id, documentGeneration: tab.documentGeneration,
        activationGeneration: identity.activationGeneration + 1 };
    input = { ...input, activeTabId: id, activeDocumentGeneration: tab.documentGeneration,
        activeFingerprint: tab.fingerprint, visibleNodes: tab.nodes, visibleEdges: tab.edges };
    render();
};
const flushFrames = async (count = 1) => {
    for (let index = 0; index < count; index += 1) await act(async () => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(0));
    });
};
const forceFrames = async (callbacks) => act(async () => callbacks.forEach((callback) => callback(0)));
const hasClass = (id, name) => result.liveVisibleNodes.find((node) => node.id === id)
    ?.className?.split(/\s+/).includes(name) || false;
const green = (id) => hasClass(id, "runtime-log-target-node");
const context = (id) => hasClass(id, "runtime-live-context-node");
const enableCamera = async () => poll({}, { followCamera: true });

test.before(async () => {
    for (const [name, value] of Object.entries({ window, document: window.document,
        navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element,
        Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    ({ createRoot } = await import("react-dom/client"));
    const { createServer } = await import("vite");
    server = await createServer({ configFile: false, appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] } });
    ({ useLiveExecution } = await server.ssrLoadModule("/src/hooks/editor/useLiveExecution.js"));
});
test.beforeEach(() => {
    frames = new Map(); allFrames = new Map(); cancelled = []; nextFrame = 0;
    fits = []; switches = []; result = null; mounted = true;
    window.requestAnimationFrame = (callback) => {
        const id = nextFrame++; frames.set(id, callback); allFrames.set(id, callback); return id;
    };
    window.cancelAnimationFrame = (id) => { cancelled.push(id); frames.delete(id); };
    container = window.document.createElement("div"); window.document.body.append(container);
    root = createRoot(container);
});
test.afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    assert.equal(frames.size, 0, "all owned frames must be cancelled on unmount");
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

test("canonical root IDs retain every hash component and dots inside suffixes, including repeated instances", async () => {
    const workflow = documentSnapshot("root", [skill("first", "dialog.Talk#inside"),
        skill("second", "dialog.Talk#other"), skill("dots", "dialog.Talk#inside#s2#scope.with.dots")]);
    await mount(workflow, ["Talk#inside", "Talk#inside#s2#scope.with.dots"]);
    assert.equal(result.liveActive, true);
    assert.equal(green("first"), true); assert.equal(green("second"), false); assert.equal(green("dots"), true);
    assert.deepEqual(result.unresolvedStates, []);
    await poll({ currentStates: ["Talk#other", "dots"] });
    assert.equal(green("first"), false); assert.equal(green("second"), true); assert.equal(green("dots"), false);
    assert.deepEqual(result.unresolvedStates, ["dots"], "an editor ID is not a runner alias");
});

test("package collisions and duplicate executable IDs are unresolved, never a first or label match", async () => {
    const workflow = documentSnapshot("root", [skill("one", "a.Work#same"), skill("two", "b.Work#same"),
        skill("three", "pkg.Other", { data: { label: "Work", fullSkillName: "pkg.Other" } }),
        skill("four", "pkg.Duplicate"), skill("five", "pkg.Duplicate")]);
    await mount(workflow, ["Work#same", "Duplicate", "Work"]);
    assert.equal(result.liveVisibleNodes, workflow.nodes);
    assert.deepEqual(result.unresolvedStates, ["Duplicate", "Work", "Work#same"]);
    await poll({ currentStates: ["a.Work#same"] });
    assert.equal(green("one"), false); assert.equal(green("two"), false);
    assert.deepEqual(result.unresolvedStates, ["Work#same"]);
});

test("clones are visual representatives of the real state, with canonical camera preference and no UUID runners", async () => {
    const original = skill("canonical", "pkg.Work#1");
    const clone = skill("clone-uuid", "pkg.Work#1", { data: { ...original.data,
        cloneOfNodeId: "canonical", isSkillClone: true, editorInstanceId: "visual-reference" } });
    const orphan = skill("orphan", "pkg.Phantom", { data: { fullSkillName: "pkg.Phantom",
        cloneOfNodeId: "absent", isSkillClone: true } });
    await mount(documentSnapshot("root", [original, clone, orphan]), ["Work#1", "clone-uuid", "Phantom"]);
    assert.equal(green("canonical"), true); assert.equal(green("clone-uuid"), true);
    assert.equal(green("orphan"), false); assert.equal(result.liveVisibleNodes[1].data, clone.data);
    assert.deepEqual(result.unresolvedStates, ["Phantom", "clone-uuid"]);
    await enableCamera(); await flushFrames();
    assert.deepEqual(fits[0].nodes, [{ id: "canonical" }]);
    await update({ visibleNodes: [clone] });
    assert.equal(green("clone-uuid"), true);
    assert.equal(fits.length, 1, "visibility alone is not an execution change");
});

test("shared End and forwarding-Nop identities use existing exported identity helpers", async () => {
    const end = skill("end", "pkg.End#editor", { data: { fullSkillName: "pkg.End#editor", scxmlStateId: "pkg.End" } });
    const endAlias = { ...end, id: "end-alias", parentId: "container" };
    const nop = skill("nop", "pkg.Nop#editor", { data: { fullSkillName: "pkg.Nop#editor",
        isBehaviorExit: true, behaviorExitEvents: ["child.success"], behaviorExitTransitions: [] } });
    await mount(documentSnapshot("root", [end, endAlias, nop]), ["End", "Nop#child.success"]);
    assert.equal(green("end"), true); assert.equal(green("end-alias"), true); assert.equal(green("nop"), true);
    assert.deepEqual(result.unresolvedStates, []);
});

test("projection is immutable, retains dirty state, node data and every unrelated object identity", async () => {
    const active = skill("active", "pkg.Work", { selected: true, className: "user-node" });
    const unrelated = skill("other", "pkg.Other");
    const slot = { id: "slot", type: "slot", data: { path: "/value", runtimeSlotValue: "existing" } };
    const edge = { id: "edge", source: "active", target: "other", selected: true,
        animated: false, style: { stroke: "red" }, data: { cond: "false", assignments: [{ location: "x", expr: "1" }] } };
    const workflow = documentSnapshot("root", [active, unrelated], { edges: [edge], isModified: true });
    workflow.savedFingerprint = "older saved document"; workflow.isModified = true;
    const before = JSON.stringify(workflow);
    await mount(workflow, ["Work"], [], { visibleNodes: [active, unrelated, slot] });
    assert.notEqual(result.liveVisibleNodes[0], active);
    assert.equal(result.liveVisibleNodes[0].data, active.data); assert.equal(result.liveVisibleNodes[0].selected, true);
    assert.equal(result.liveVisibleNodes[1], unrelated); assert.equal(result.liveVisibleNodes[2], slot);
    assert.equal(result.liveVisibleEdges, workflow.edges); assert.equal(result.liveVisibleEdges[0], edge);
    assert.equal(JSON.stringify(workflow), before); assert.equal(workflow.isModified, true);
    assert.equal(getWorkflowDocumentFingerprint(workflow), workflow.fingerprint);
    assert.equal(getWorkflowDocumentFingerprint({ ...workflow, nodes: result.liveVisibleNodes.slice(0, 2),
        edges: result.liveVisibleEdges }), workflow.fingerprint);
    const decorated = result.liveVisibleNodes[0];
    await poll({ transitions: ["Work.success"], stateIds: ["Anything"] });
    assert.equal(result.liveVisibleNodes[0], decorated);
});

test("possible conditional transitions and non-atomic state/event observations never fabricate executed edges or values", async () => {
    const edges = ["yes", "no"].map((id) => ({ id, source: "work", target: "done", sourceHandle: "success",
        animated: false, data: { event: "Work.success", cond: id === "yes" ? "true" : "false" } }));
    const workflow = documentSnapshot("root", [skill("work", "pkg.Work"), skill("done", "pkg.Done")], { edges });
    await mount(workflow, ["Work"]);
    await poll({ transitions: ["Done.success", "Work.success"] }, { event: { name: "Work.success", sentAt: 7 } });
    assert.equal(green("work"), true); assert.equal(green("done"), false);
    await poll({ currentStates: ["Done"], transitions: ["Work.success"] });
    assert.equal(green("work"), false); assert.equal(green("done"), true);
    assert.equal(result.liveVisibleEdges, edges);
    edges.forEach((edge, index) => assert.equal(result.liveVisibleEdges[index], edge));
    result.liveVisibleNodes.forEach((node) => {
        assert.equal(node.data.runtimeParameterValues, undefined); assert.equal(node.data.runtimeSlotValue, undefined);
        assert.equal(node.className?.includes("runtime-log-source-node") || false, false);
    });
});

test("closed sourced machines map inner/outer and dotted scope IDs to contextual wrappers only", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1.with.dots")]);
    await mount(workflow, ["Talk#inside#s2#s1.with.dots"]);
    assert.equal(context("wrapper"), true); assert.equal(green("wrapper"), false);
    assert.deepEqual(result.unresolvedStates, ["Talk#inside#s2#s1.with.dots"]);
    await enableCamera(); await flushFrames();
    assert.deepEqual(fits[0].nodes, [{ id: "wrapper" }]); assert.deepEqual(switches, []);
});

test("ordinary compound nesting adds no runner suffix and collapsed ancestry is contextual, not reported active", async () => {
    const compound = { id: "compound", type: "compound", data: { label: "Container", isCollapsed: true } };
    const active = skill("inner", "pkg.Work#1", { parentId: "compound" });
    const workflow = documentSnapshot("root", [compound, active]);
    await mount(workflow, ["Work#1"], [], { visibleNodes: [compound] });
    assert.equal(context("compound"), true); assert.equal(green("compound"), false);
    assert.deepEqual(result.unresolvedStates, []);
    assert.equal(compound.data.isCollapsed, true);
    await update({ visibleNodes: [{ ...compound, data: { ...compound.data, isCollapsed: false } }] });
    assert.equal(context("compound"), false, "a filtered-out node is not an active arbitrary ancestor");
});

test("nested collapsed compound/parallel projection chooses the visible collapsed ancestor without expansion", async () => {
    const outer = { id: "outer", type: "parallel", data: { isCollapsed: true } };
    const inner = { id: "inner", type: "compound", parentId: "outer", data: { isCollapsed: true } };
    const active = skill("active", "pkg.Work", { parentId: "inner" });
    await mount(documentSnapshot("root", [outer, inner, active]), ["Work"], [], { visibleNodes: [outer] });
    assert.equal(context("outer"), true); assert.equal(green("outer"), false);
    assert.equal(outer.data.isCollapsed, true); assert.equal(inner.data.isCollapsed, true);
    await enableCamera(); await flushFrames(); assert.deepEqual(fits[0].nodes, [{ id: "outer" }]);
});

test("open child source/parent association uses the exported wrapper ID rather than title or display label", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")]);
    const child = childSnapshot("child", undefined, { title: "Definitely not s1" });
    await mount(workflow, ["Talk#inside#s1"], [child]);
    assert.equal(context("wrapper"), true); assert.deepEqual(result.unresolvedStates, []);
    await act(async () => activate("child"));
    assert.equal(green("talk"), true); assert.equal(result.liveActive, true); assert.deepEqual(switches, []);
});

test("rebinding a symbolic root cannot paint or enter an old saved child with the same runner names", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")], { includeMapping: { BEH: "/new" } });
    const child = childSnapshot("child", undefined, { filePath: "/old/child.xml" });
    await mount(workflow, ["Talk#inside#s1"], [child]);
    assert.equal(context("wrapper"), true);
    assert.deepEqual(result.unresolvedStates, ["Talk#inside#s1"]);
    await enableCamera(); await flushFrames(); assert.deepEqual(switches, []);
    assert.deepEqual(fits[0].nodes, [{ id: "wrapper" }]);
    await act(async () => activate("child")); assert.equal(green("talk"), false); assert.equal(result.liveActive, false);
});

for (const source of ["../behaviors/child.xml", "/behaviors/child.xml"]) {
    test(`a saved child is associated with its load-time declaring path for ${source}`, async () => {
        const workflow = documentSnapshot("root", [wrapper("wrapper", "s1", source)]);
        const child = childSnapshot("child", undefined, { sourcePath: source });
        await mount(workflow, ["Talk#inside#s1"], [child]);
        assert.deepEqual(result.unresolvedStates, []);
        await act(async () => activate("child")); assert.equal(green("talk"), true);
    });
}

test("changed child file metadata fences paint and pending tab-follow even with an unchanged fingerprint", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")]);
    const child = childSnapshot();
    await mount(workflow, ["Talk#inside#s1"], [child]); await enableCamera();
    const pending = [...frames.values()];
    await update({ tabs: [workflow, { ...child, filePath: "/other/child.xml" }] });
    await forceFrames(pending); assert.deepEqual(switches, []);
    await act(async () => activate("child")); assert.equal(green("talk"), false); assert.equal(result.liveActive, false);
});

for (const [description, metadata] of [
    ["unsaved edits", { isModified: true, savedFingerprint: "last disk checkpoint" }],
    ["a mismatched disk checkpoint", { savedFingerprint: "last disk checkpoint" }],
]) test(`an open sourced child with ${description} is not mistaken for staged child contents`, async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")]);
    const child = { ...childSnapshot(), ...metadata };
    await mount(workflow, ["Talk#inside#s1"], [child]);
    assert.equal(context("wrapper"), true);
    assert.deepEqual(result.unresolvedStates, ["Talk#inside#s1"]);
    await enableCamera(); await flushFrames();
    assert.deepEqual(fits[0].nodes, [{ id: "wrapper" }]); assert.deepEqual(switches, []);
    await act(async () => activate("child"));
    assert.equal(result.liveActive, false); assert.equal(green("talk"), false);
});

test("nested open scopes preserve inner-to-outer ordering and hash/dot components of exported wrapper IDs", async () => {
    const workflow = documentSnapshot("root", [wrapper("s1", "scope.one#instance")]);
    const child = childSnapshot("child", [wrapper("s2", "scope.two", "${BEH}/grand.xml")]);
    const grand = childSnapshot("grand", [skill("talk", "dialog.Talk#inside")], {
        parentTabId: "child", sourcePath: "${BEH}/grand.xml" });
    await mount(workflow, ["Talk#inside#scope.two#scope.one#instance"], [child, grand]);
    assert.equal(context("s1"), true);
    await act(async () => activate("child")); assert.equal(context("s2"), true); assert.equal(green("s2"), false);
    await act(async () => activate("grand")); assert.equal(green("talk"), true);
    assert.deepEqual(result.unresolvedStates, []);
});

test("multiple invocations of one child tab retain separate contexts and a whole parallel set stays at root", async () => {
    const workflow = documentSnapshot("root", [wrapper("first", "s1"), wrapper("second", "s2")]);
    const child = childSnapshot();
    await mount(workflow, ["Talk#inside#s1", "Talk#inside#s2"], [child]);
    assert.equal(context("first"), true); assert.equal(context("second"), true);
    assert.deepEqual(result.unresolvedStates, []);
    await enableCamera(); await flushFrames();
    assert.deepEqual(switches, []); assert.deepEqual(fits[0].nodes, [{ id: "first" }, { id: "second" }]);
    await act(async () => activate("child")); assert.equal(green("talk"), true);
    await poll({ currentStates: ["Talk#inside#s2", "Talk#inside#s1"] }); await flushFrames();
    assert.deepEqual(switches, [], "manual navigation and set order must not cause bouncing");
});

test("ambiguous child files and ambiguous wrapper suffixes are never resolved by first match", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")]);
    await mount(workflow, ["Talk#inside#s1"], [childSnapshot("child-a"), childSnapshot("child-b")]);
    assert.equal(context("wrapper"), true); assert.deepEqual(result.unresolvedStates, ["Talk#inside#s1"]);
    await enableCamera(); await flushFrames(); assert.deepEqual(switches, []);
    await act(async () => activate("child-a")); assert.equal(result.liveActive, false); assert.equal(green("talk"), false);
    const ambiguous = documentSnapshot("root", [wrapper("a", "same"), wrapper("b", "same", "${BEH}/other.xml")]);
    await mount(ambiguous, ["Talk#inside#same"]);
    assert.equal(result.liveVisibleNodes, ambiguous.nodes); assert.deepEqual(result.unresolvedStates, ["Talk#inside#same"]);
});

test("unloaded, unrelated and title-only child documents are excluded from engine identity mapping", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1"), skill("root-talk", "dialog.Talk#inside")]);
    const unrelated = childSnapshot("unrelated", [skill("same", "other.Talk#inside")], { parentTabId: null });
    const wrongSource = childSnapshot("wrong", undefined, { sourcePath: "${OTHER}/child.xml", title: "s1" });
    await mount(workflow, ["Talk#inside", "Talk#inside#s1"], [unrelated, wrongSource]);
    assert.equal(green("root-talk"), true); assert.equal(context("wrapper"), true);
    assert.deepEqual(result.unresolvedStates, ["Talk#inside#s1"]);
    const newlyOpen = childSnapshot("new");
    await update({ tabs: [...input.tabs, newlyOpen] });
    await act(async () => activate("new")); assert.equal(result.liveActive, false); assert.equal(green("talk"), false);
});

test("child semantic edits invalidate its paint and camera destination, but retain valid parent wrapper context", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")]);
    const child = childSnapshot();
    await mount(workflow, ["Talk#inside#s1"], [child]); await enableCamera();
    const pending = [...frames.values()];
    const edited = documentSnapshot("child", [skill("talk", "dialog.Changed")], {
        parentTabId: "root", sourcePath: child.sourcePath, documentGeneration: child.documentGeneration });
    await update({ tabs: [workflow, edited] });
    await forceFrames(pending); assert.deepEqual(switches, []);
    assert.equal(context("wrapper"), true); await flushFrames();
    assert.deepEqual(fits[0].nodes, [{ id: "wrapper" }]);
    await act(async () => activate("child")); assert.equal(result.liveActive, false); assert.equal(green("talk"), false);
    assert.equal(input.liveExecution.tabsSnapshot[1], child, "poll/edit never substitutes a new loaded graph");
});

test("intermediate ancestor version drift fences an otherwise unchanged open grandchild", async () => {
    const workflow = documentSnapshot("root", [wrapper("s1", "s1")]);
    const child = childSnapshot("child", [wrapper("s2", "s2", "${BEH}/grand.xml")]);
    const grand = childSnapshot("grand", undefined, { parentTabId: "child", sourcePath: "${BEH}/grand.xml" });
    await mount(workflow, ["Talk#inside#s2#s1"], [child, grand]);
    await act(async () => activate("grand")); assert.equal(green("talk"), true);
    await update({ tabs: [workflow, { ...child, fingerprint: "changed wrapper association" }, grand] });
    assert.equal(result.liveActive, false); assert.equal(green("talk"), false);
    await act(async () => activate("root")); assert.equal(context("s1"), true);
});

test("missing loaded generation/fingerprint metadata is not an unfenced fallback", async () => {
    const workflow = documentSnapshot("root", [skill("work", "pkg.Work")]);
    await mount({ ...workflow, documentGeneration: undefined }, ["Work"]);
    assert.equal(result.liveActive, false); assert.equal(green("work"), false);
    await mount({ ...workflow, fingerprint: undefined }, ["Work"]);
    assert.equal(result.liveActive, false); assert.equal(green("work"), false);
});

test("unchanged snapshots, order, duplicates, possible events and checkedAt ticks never move the camera", async () => {
    const workflow = documentSnapshot("root", [skill("b", "pkg.B"), skill("a", "pkg.A")]);
    await mount(workflow, ["B", "A"], [], { liveExecution: {
        workflow, tabsSnapshot: [workflow], snapshot: { status: "RUNNING", currentStates: ["B", "A"], checkedAt: 1 },
        following: true, followCamera: true } });
    assert.ok(cancelled.includes(0), "StrictMode cancellation must handle RAF ID zero");
    await flushFrames(); assert.equal(fits.length, 1);
    assert.deepEqual(fits[0], { nodes: [{ id: "a" }, { id: "b" }], padding: 0.55, duration: 320, maxZoom: 1.15 });
    const painted = result.liveVisibleNodes;
    for (let count = 0; count < 5; count += 1) {
        await poll({ currentStates: ["A", "B", "A"], transitions: [`unobserved.${count}`] },
            { event: { name: "A.success", sentAt: count } });
        await flushFrames();
    }
    assert.equal(fits.length, 1); assert.equal(result.liveVisibleNodes, painted); assert.deepEqual(switches, []);
    await update({ visibleNodes: workflow.nodes.map((node) => ({ ...node, measured: { width: 100, height: 100 } })) });
    await flushFrames(); assert.equal(fits.length, 1);
});

test("only actual active ID changes or explicit Follow re-enable refit the whole parallel set", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A"), skill("b", "pkg.B"), skill("c", "pkg.C")]);
    await mount(workflow, ["A", "B"]); await enableCamera(); await flushFrames();
    await poll({ currentStates: ["B", "C"] }); await flushFrames();
    assert.equal(fits.length, 2); assert.deepEqual(fits[1].nodes, [{ id: "b" }, { id: "c" }]);
    await poll({}, { followCamera: false }); assert.equal(green("b"), true); assert.equal(frames.size, 0);
    await enableCamera(); await flushFrames(); assert.equal(fits.length, 3);
});

test("Pause retains active paint and permits free pan; Resume follows once without tick-driven movement", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A"), skill("b", "pkg.B")]);
    await mount(workflow, ["A"]); await enableCamera(); await flushFrames();
    await poll({ status: "PAUSED" }); assert.equal(green("a"), true); assert.equal(frames.size, 0);
    await poll({ currentStates: ["B"] }); await flushFrames(); assert.equal(green("b"), true); assert.equal(fits.length, 1);
    await poll({ status: "RUNNING" }, { action: "resume" }); await flushFrames();
    assert.equal(fits.length, 2); assert.deepEqual(fits[1].nodes, [{ id: "b" }]);
    await poll({}, { action: undefined }); await flushFrames(); assert.equal(fits.length, 2);
});

test("disabled following, failed reads and non-executing statuses do not paint or follow", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    await mount(workflow, ["A"]); await enableCamera();
    const pending = [...frames.values()];
    await poll({}, { following: false }); await forceFrames(pending);
    assert.equal(result.liveActive, false); assert.equal(result.liveVisibleNodes, workflow.nodes); assert.equal(fits.length, 0);
    for (const status of ["INITIALIZED", "INITIALIZED_BUT_WARNINGS", "LOADING", "UNKNOWN"]) {
        await poll({ status }, { following: true }); assert.equal(result.liveActive, false); assert.equal(green("a"), false);
    }
    await update({ liveExecution: { ...input.liveExecution, snapshot: null } });
    assert.equal(result.liveActive, false); assert.equal(frames.size, 0);
});

test("suspension cancels late camera/tab frames while keeping paint, and releases only pending follow work", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A"), skill("b", "pkg.B")]);
    await mount(workflow, ["A"]); await enableCamera();
    const pending = [...frames.values()];
    await update({ suspendFollow: true }); await forceFrames(pending);
    assert.equal(green("a"), true); assert.equal(fits.length, 0); assert.equal(frames.size, 0);
    await poll({ currentStates: ["B"] }); await update({ suspendFollow: false }); await flushFrames();
    assert.equal(fits.length, 1); assert.deepEqual(fits[0].nodes, [{ id: "b" }]);
    await update({ suspendFollow: true }); await update({ suspendFollow: false }); await flushFrames();
    assert.equal(fits.length, 1, "closing a drawer/modal without active-set change does not recenter");
});

test("a single proven child invocation switches only to its open tab and fits after viewport restoration", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")]);
    const child = childSnapshot("child", [skill("talk", "dialog.Talk#inside"), skill("other", "dialog.Other")]);
    await mount(workflow, ["Talk#inside#s1", "Other#s1"], [child], {
        switchTab: (id) => { switches.push(id); activate(id); } });
    await enableCamera(); await flushFrames();
    assert.deepEqual(switches, ["child"]); assert.equal(green("talk"), true); assert.equal(fits.length, 0);
    await flushFrames(); assert.equal(fits.length, 0);
    await flushFrames(); assert.equal(fits.length, 1);
    assert.deepEqual(fits[0].nodes, [{ id: "other" }, { id: "talk" }]);
    await poll(); await flushFrames(3); assert.deepEqual(switches, ["child"]); assert.equal(fits.length, 1);
});

test("parallel execution across root/child contexts follows the complete root representation without bouncing", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1"), skill("a", "pkg.A")]);
    const child = childSnapshot();
    await mount(workflow, ["A", "Talk#inside#s1"], [child], {
        switchTab: (id) => { switches.push(id); activate(id); } });
    await act(async () => activate("child")); await enableCamera(); await flushFrames(3);
    assert.deepEqual(switches, ["root"]); assert.equal(fits.length, 1);
    assert.deepEqual(fits[0].nodes, [{ id: "a" }, { id: "wrapper" }]);
    await poll(); await flushFrames(3); assert.deepEqual(switches, ["root"]);
});

test("manual tab switching cancels outstanding follow and unchanged polls never pull the user back", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1"), skill("a", "pkg.A")]);
    const child = childSnapshot();
    await mount(workflow, ["A"], [child]); await enableCamera();
    const pending = [...frames.values()];
    await act(async () => activate("child")); await forceFrames(pending);
    await poll(); await flushFrames(3);
    assert.equal(fits.length, 0); assert.deepEqual(switches, []);
    await act(async () => activate("root")); await poll(); await flushFrames();
    assert.equal(fits.length, 0); assert.deepEqual(switches, []);
});

test("the synchronous activation getter fences switch-back even when no new props have committed", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    await mount(workflow, ["A"]); await enableCamera();
    identity = { ...identity, activationGeneration: identity.activationGeneration + 2 };
    await flushFrames(); assert.equal(fits.length, 0); assert.deepEqual(switches, []);
});

test("Stop and disabled/log-arbitration records cancel late frames and return exact base arrays", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    await mount(workflow, ["A"]); await enableCamera();
    const pending = [...frames.values()];
    await poll({}, { action: "stop" }); await forceFrames(pending);
    assert.equal(result.liveActive, false); assert.equal(result.liveVisibleNodes, workflow.nodes); assert.equal(fits.length, 0);
    await update({ liveExecution: null }); await forceFrames([...allFrames.values()]);
    assert.equal(result.liveVisibleNodes, workflow.nodes); assert.equal(result.liveVisibleEdges, workflow.edges);
    assert.equal(frames.size, 0); assert.equal(fits.length, 0);
});

test("replacement execution sessions own distinct frames even for identical root IDs/fingerprints", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    await mount(workflow, ["A"]); await enableCamera();
    const stale = [...frames.values()];
    await update({ liveExecution: { ...input.liveExecution, workflow: { ...workflow }, tabsSnapshot: [{ ...workflow }] } });
    await forceFrames(stale); assert.equal(fits.length, 0);
    await flushFrames(); assert.equal(fits.length, 1); assert.equal(green("a"), true);
});

for (const field of ["generation", "fingerprint"]) test(`same-ID document ${field} drift hides paint and fences every late frame`, async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    await mount(workflow, ["A"]); await enableCamera();
    const stale = [...frames.values()];
    await update(field === "generation" ? { activeDocumentGeneration: 2 } : { activeFingerprint: "edited semantic version" });
    await forceFrames(stale); await flushFrames();
    assert.equal(result.liveActive, false); assert.equal(green("a"), false);
    assert.equal(fits.length, 0); assert.deepEqual(switches, []);
});

test("child generation replacement before an owned post-switch frame cannot fit the replacement", async () => {
    const workflow = documentSnapshot("root", [wrapper("wrapper", "s1")]);
    const child = childSnapshot();
    await mount(workflow, ["Talk#inside#s1"], [child], { switchTab: (id) => { switches.push(id); activate(id); } });
    await enableCamera(); await flushFrames(); await flushFrames();
    const stale = [...frames.values()];
    await update({ activeDocumentGeneration: 2, tabs: [workflow, { ...child, documentGeneration: 2 }] });
    await forceFrames(stale); await flushFrames(3);
    assert.equal(fits.length, 0); assert.equal(result.liveActive, false); assert.deepEqual(switches, ["child"]);
});

test("unrelated active documents never receive paint, camera work or forced return to the loaded root", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    const unrelated = documentSnapshot("unrelated", [skill("a", "pkg.A")]);
    await mount(workflow, ["A"], [unrelated]); await act(async () => activate("unrelated"));
    await enableCamera(); await poll({ currentStates: ["A", "B"] }); await flushFrames();
    assert.equal(result.liveActive, false); assert.equal(result.liveVisibleNodes, unrelated.nodes);
    assert.equal(fits.length, 0); assert.deepEqual(switches, []);
});

test("unmount and StrictMode cleanup fence forced callbacks, including cancelled frame zero", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    await mount(workflow, ["A"], [], { liveExecution: { workflow, tabsSnapshot: [workflow],
        snapshot: { status: "RUNNING", currentStates: ["A"] }, following: true, followCamera: true } });
    assert.ok(cancelled.includes(0));
    const stale = [...allFrames.values()];
    await act(async () => root.unmount()); mounted = false;
    await forceFrames(stale); assert.equal(fits.length, 0); assert.deepEqual(switches, []); assert.equal(frames.size, 0);
});

test("abandoned suspended renders cannot publish their mapping or steal committed frame ownership", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A"), skill("b", "pkg.B")]);
    await mount(workflow, ["A"]); await enableCamera();
    const stale = [...frames.values()];
    const committed = result;
    await act(async () => {
        input = { ...input, liveExecution: { ...input.liveExecution,
            snapshot: { ...input.liveExecution.snapshot, currentStates: ["B"] } } };
        render(true);
    });
    assert.equal(result, committed);
    await forceFrames(stale); assert.equal(fits.length, 0, "hidden committed layout owns no active RAF");
    await act(async () => render()); await flushFrames();
    assert.equal(green("b"), true); assert.equal(fits.length, 1); assert.deepEqual(fits[0].nodes, [{ id: "b" }]);
});

test("polling does not revisit loaded semantic identities or build native/replay/export state", async () => {
    const workflow = documentSnapshot("root", [skill("a", "pkg.A")]);
    let reads = 0;
    const data = { label: "A", get fullSkillName() { reads += 1; return "pkg.A"; } };
    const captured = { ...workflow, nodes: [{ ...workflow.nodes[0], data }] };
    await mount(captured, ["A"]);
    const compiledReads = reads;
    const painted = result.liveVisibleNodes;
    for (let count = 0; count < 10; count += 1) await poll({ transitions: ["A.success"], stateIds: ["A"] });
    assert.equal(reads, compiledReads); assert.equal(result.liveVisibleNodes, painted);
    assert.equal(fits.length, 0); assert.deepEqual(switches, []);
});

test("context expansion is bounded and excess open invocations retain honest closed-wrapper fallback", async () => {
    const wrappers = Array.from({ length: 300 }, (_, index) => wrapper(`wrapper-${index}`, `s${index}`));
    const workflow = documentSnapshot("root", wrappers);
    await mount(workflow, ["Talk#inside#s0", "Talk#inside#s299"], [childSnapshot()]);
    assert.equal(context("wrapper-0"), true); assert.equal(context("wrapper-299"), true);
    assert.deepEqual(result.unresolvedStates, ["Talk#inside#s299"]);
});
