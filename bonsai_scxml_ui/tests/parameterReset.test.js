import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost/" });
const originals = new Map();
const noop = () => {};
const skill = (data = {}) => ({
    id: "skill", type: "custom", position: { x: 10, y: 20 },
    data: {
        label: "Node", fullSkillName: "library.Object_Method.Source.CI.Node#instance", src: "",
        params: [{ key: "count", type: "Integer", expr: "7", default: 3 }],
        events: [{ id: "done", target: "target", cond: "@ready", assignments: [{ location: "result", expr: "1" }] }],
        inSlots: [{ key: "input", type: "String", path: "/input", inherited: { state: "parent" } }],
        outSlots: [{ key: "output", type: "Integer", path: "/output" }],
        onEntry: [{ location: "result", expr: "2" }], onExit: [], ...data,
    },
});
const documentWith = (id = "a", nodes = [skill()], globalDataModel = []) => ({
    id, title: id, fileName: `${id}.xml`, nodes, globalDataModel, selectedNodeId: "skill",
    edges: [], manualSlots: [], slotNodes: [], slotEdges: [], inheritedGlobalDataModel: [],
});
const deferred = () => {
    let resolve;
    const promise = new Promise((yes) => { resolve = yes; });
    return { promise, resolve };
};
let React;
let createRoot;
let modules;
let server;
let root;
let container;
let current;
let requests;
let nativeCalls;
let commits;
let frames;
let frameId;
let revision;
let slotCalls;
let domErrors;
const fetchSkillData = (name, params) => {
    const request = { name, params, ...deferred() };
    requests.push(request);
    return request.promise;
};

function Harness({ withDetails = false }) {
    const graph = modules.useEditorGraphState();
    const [selectedNodeId, setSelectedNodeId] = React.useState("skill");
    const native = modules.useRustWorkflowDocument(graph);
    const tabs = modules.useWorkflowTabs({
        ...graph, selectedNodeId, setSelectedNodeId, isDraggingNode: false,
        fitView: noop, getViewport: noop, setViewport: noop, syncRustDocument: native.syncEditorState,
    });
    const dynamic = modules.useDynamicSkillConfiguration({
        getDocumentSnapshot: graph.getDocumentSnapshot,
        getActiveDocumentIdentity: tabs.getActiveDocumentIdentity,
        setNodes: graph.setNodes, fetchSkillData,
        checkSlotConnection: (...args) => slotCalls.push(args),
        syncStateConfigurationAfterCommit: native.syncStateConfigurationAfterCommit,
    });
    const actions = modules.useEditorActions({
        ...graph, getActiveDocumentIdentity: tabs.getActiveDocumentIdentity,
        valueVariables: [...graph.inheritedGlobalDataModel, ...graph.globalDataModel],
        selectedNodeId, setSelectedNodeId, setRightPanelTab: noop, setActiveTab: noop,
        checkSlotConnection: noop, updateNodeInternals: noop,
        applyWorkflowCommand: native.applyWorkflowCommand,
        syncStateParameters: native.syncStateParameters,
        syncStateConfigurationAfterCommit: native.syncStateConfigurationAfterCommit,
        syncStateEditorPositions: native.syncStateEditorPositions,
        syncSlotsAfterCommit: native.syncSlotsAfterCommit,
        updateEventsFromParameters: (...args) => dynamic.updateEventsFromParameters(...args),
    });
    const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
    const callbacks = modules.useEditorDetailsCallbacks({
        getParameterEditSource: actions.getNodeParameterEditSource,
        onUpdateParameter: (index, value, commit, source) => {
            const result = actions.updateNodeParameter(source?.nodeId || selectedNode.id, index, value, commit, source);
            commits.push({ index, value, commit, source, result });
            return result;
        },
    });
    React.useLayoutEffect(() => { current = { graph, tabs, dynamic, native, actions, callbacks, setSelectedNodeId }; },
        [graph, tabs, dynamic, native, actions, callbacks]);
    if (!selectedNode) return null;
    const props = { selectedNode, valueVariables: graph.globalDataModel, ...callbacks };
    return withDetails
        ? React.createElement(modules.DetailsPanel, { ...props, actionValueVariables: graph.globalDataModel,
            activeTab: "parameter", setActiveTab: noop, globalDataModel: graph.globalDataModel })
        : React.createElement(modules.ParametersSection, props);
}

test.before(async () => {
    frames = new Map(); frameId = 0;
    window.requestAnimationFrame = (callback) => { const id = frameId++; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    window.__TAURI_INTERNALS__ = { invoke: async (name, args) => {
        nativeCalls.push({ name, args });
        assert.ok(["apply_workflow_command", "replace_active_editor_workflow_document"].includes(name));
        return { revision: ++revision, patch: {} };
    } };
    window.addEventListener("error", (event) => domErrors.push(event.error || event.message));
    for (const [name, value] of Object.entries({
        window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
        Element: window.Element, Node: window.Node, Event: window.Event,
        getComputedStyle: window.getComputedStyle.bind(window),
        requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    React = await import("react");
    ({ createRoot } = await import("react-dom/client"));
    const { createServer } = await import("vite");
    const { default: react } = await import("@vitejs/plugin-react");
    server = await createServer({
        configFile: false, plugins: [react()], appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] },
    });
    const loaded = await Promise.all([
        "/src/hooks/graph/useEditorGraphState.js", "/src/hooks/graph/useEditorActions.js",
        "/src/hooks/document/useWorkflowTabs.js", "/src/hooks/document/useRustWorkflowDocument.js",
        "/src/hooks/library/useDynamicSkillConfiguration.js", "/src/hooks/editor/useEditorDetailsController.js",
        "/src/components/inspector/DetailsTabSections.jsx", "/src/components/inspector/DetailsPanel.jsx",
        "/src/components/inputs/TypedValueEditor.jsx", "/src/utils/scxmlRustExport.js",
    ].map((path) => server.ssrLoadModule(path)));
    modules = Object.assign({}, ...loaded.slice(0, 7), loaded[9], {
        DetailsPanel: loaded[7].default, TypedValueEditor: loaded[8].default,
    }, await server.ssrLoadModule("/src/hooks/graph/editorActions/useEditorNodeDataActions.js"));
});
test.beforeEach(async () => {
    requests = []; nativeCalls = []; commits = []; slotCalls = []; domErrors = []; revision = 0;
    frames.clear();
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
    await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness))));
});
test.afterEach(async () => {
    await React.act(async () => root.unmount());
    container.remove();
    frames.clear();
    await window.happyDOM.cancelAsync();
    assert.deepEqual(domErrors, []);
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
        assert.ok(pass < 20, "native/dynamic frame work must converge");
        await React.act(async () => {
            const callbacks = [...frames.values()];
            frames.clear();
            callbacks.forEach((callback) => callback(pass * 16));
        });
    }
};
const open = async (document = documentWith()) => {
    await React.act(async () => current.tabs.openTab(document, { fit: false }));
    await flushFrames();
    nativeCalls.length = 0;
};
const parameterCommands = () => nativeCalls.filter(({ args }) => args.command?.type === "replaceStateParameters");
const input = (key = "count") => [...container.querySelectorAll(".parameter-card")]
    .find((row) => row.querySelector(".parameter-name").textContent.trim().replace(/\*$/, "") === key)?.querySelector("input");
const focus = async (target) => React.act(async () => target.focus());
const blur = async (target) => React.act(async () => target.blur());
const type = async (target, value) => React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(target, value);
    target.dispatchEvent(new window.Event("input", { bubbles: true }));
});
const key = async (target, value) => React.act(async () => target.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
));
const editNode = (update) => current.graph.setNodes((nodes) => nodes.map((node) => node.id === "skill" ? update(node) : node));
const reply = async (request, definition) => React.act(async () => request.resolve(definition));

test("clearing a valid parameter ignores an invalid imported sibling and preserves every binding", async () => {
    const invalid = Object.freeze({ key: "invalid", type: "Boolean", expr: "broken", default: false });
    const untouched = Object.freeze({ key: "text", type: "String", expr: "raw imported text" });
    const source = skill({ params: [{ key: "count", type: "Integer", expr: "7", required: true, default: 3 }, invalid, untouched] });
    const other = { ...skill(), id: "other" };
    await open(documentWith("a", [source, other]));
    await focus(input());
    await type(input(), "");
    await blur(input());
    const node = current.graph.getDocumentSnapshot().nodes[0];
    assert.equal(node.data.params[0].expr, "");
    assert.equal(node.data.params[0].default, 3);
    assert.equal(node.data.params[0].required, true);
    assert.equal(node.data.params[1], invalid);
    assert.equal(node.data.params[2], untouched, "reset must not normalize imported siblings");
    assert.equal(current.graph.nodes[1], other);
    for (const field of ["events", "inSlots", "outSlots", "onEntry", "onExit"]) assert.equal(node.data[field], source.data[field]);
    assert.equal(parameterCommands().length, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].name, "library.Object_Method.Source.CI.Node");
    assert.deepEqual(requests[0].params, { invalid: "broken", text: "raw imported text" });
    const exported = modules.buildRustEditorExportRequest(current.graph.getDocumentSnapshot());
    assert.deepEqual(exported.nodes.find((node) => node.id === "skill").parameters[0], { key: "count", expression: "3" });
});

test("correcting one invalid row leaves another invalid row verbatim", async () => {
    const sibling = { key: "flag", type: "Boolean", expr: "not bool" };
    await open(documentWith("a", [skill({ params: [{ key: "count", type: "Integer", expr: "bad" }, sibling] })]));
    await React.act(async () => assert.ok(current.actions.updateNodeParameter("skill", 0, "0", true)));
    assert.equal(current.graph.nodes[0].data.params[0].expr, "0");
    assert.equal(current.graph.nodes[0].data.params[1], sibling);
    assert.equal(parameterCommands().length, 1);
});

test("same-frame edits and rapid resets rebase on the live document rather than captured parameters", async () => {
    await open(documentWith("a", [skill({ params: [
        { key: "count", type: "Integer", expr: "7" }, { key: "flag", type: "Boolean", expr: "true", default: false },
    ] })]));
    const update = current.actions.updateNodeParameter;
    await React.act(async () => {
        update("skill", 0, "9", true);
        update("skill", 1, "false", true);
        update("skill", 0, "", true);
        update("skill", 0, "", true);
    });
    assert.deepEqual(current.graph.nodes[0].data.params.map((param) => param.expr), ["", "false"]);
    assert.deepEqual(requests.map((request) => request.params), [
        { count: "9", flag: "true" }, { count: "9", flag: "false" }, { flag: "false" },
    ]);
    assert.equal(parameterCommands().length, 1, "the existing native queue coalesces same-frame parameter commands");
    assert.equal(current.actions.updateNodeParameter, update);
});

test("the legacy non-commit edit followed by an unchanged commit still synchronizes the row", async () => {
    await open();
    await React.act(async () => {
        current.actions.updateNodeParameter("skill", 0, "9", false);
        assert.equal(requests.length, 0);
        current.actions.updateNodeParameter("skill", 0, "9", true);
    });
    assert.equal(current.graph.nodes[0].data.params[0].expr, "9");
    assert.equal(parameterCommands().length, 1);
    assert.deepEqual(requests.map((request) => request.params), [{ count: "9" }]);
});

test("direct legacy node-action callers retain array/null results and row-only typed validation", async () => {
    const sibling = { key: "flag", type: "Boolean", expr: "invalid" };
    let legacy;
    function Legacy() {
        const [nodes, setNodes] = React.useState([skill({ params: [
            { key: "count", type: "Integer", expr: "7" }, sibling,
        ] })]);
        const actions = modules.useEditorNodeDataActions({ nodes, setNodes });
        React.useLayoutEffect(() => { legacy = { nodes, actions }; }, [nodes, actions]);
        return null;
    }
    await React.act(async () => root.render(React.createElement(Legacy)));
    await React.act(async () => {
        assert.equal(legacy.actions.updateNodeParameter("skill", 0, "bad", true), null);
        assert.ok(Array.isArray(legacy.actions.updateNodeParameter("skill", 0, "", true)));
    });
    assert.equal(legacy.nodes[0].data.params[0].expr, "");
    assert.equal(legacy.nodes[0].data.params[1], sibling);
    assert.equal(nativeCalls.length, 0);
});

test("legacy inspector callbacks still receive normalized index/value/commit arguments", async () => {
    const emitted = [];
    await React.act(async () => root.render(React.createElement(modules.ParametersSection, {
        selectedNode: skill({ params: [{ key: "text", type: "String", expr: "'old'" }] }),
        onUpdateParameter: (...args) => { emitted.push(args); },
    })));
    await focus(input("text"));
    await type(input("text"), "plain text");
    await key(input("text"), "Enter");
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0].slice(0, 3), [0, "'plain text'", true]);
});

test("the action validates every target-row write and rejects invalid drafts without serialized mutations", async () => {
    await open(documentWith("a", [skill()], [{ id: "numeric", type: "Integer", expr: "1" }]));
    const snapshot = current.graph.getDocumentSnapshot();
    const serialized = modules.buildRustEditorExportRequest(snapshot);
    for (const value of ["bad", "false", "@missing", "@", "1.5"]) {
        await React.act(async () => assert.equal(current.actions.updateNodeParameter("skill", 0, value, true), null));
    }
    await focus(input());
    await type(input(), "bad");
    await blur(input());
    assert.equal(input().value, "bad");
    assert.equal(input().getAttribute("aria-invalid"), "true");
    assert.match(container.querySelector(".typed-value-error").textContent, /Integer/);
    assert.equal(current.graph.getDocumentSnapshot(), snapshot);
    assert.deepEqual(modules.buildRustEditorExportRequest(current.graph.getDocumentSnapshot()), serialized);
    assert.equal(requests.length, 0);
    assert.equal(parameterCommands().length, 0);
});

test("live inherited/global variable types fence same-frame reference writes", async () => {
    await open(documentWith("a", [skill()], [{ id: "numeric", type: "Integer", expr: "1" }]));
    await React.act(async () => {
        current.graph.setGlobalDataModel([{ id: "numeric", type: "String", expr: "'changed'" }]);
        assert.equal(current.actions.updateNodeParameter("skill", 0, "@numeric", true), null);
        current.graph.setInheritedGlobalDataModel([{ id: "numeric", type: "Integer", expr: "2" }]);
        assert.ok(current.actions.updateNodeParameter("skill", 0, "@numeric", true));
    });
    assert.equal(current.graph.nodes[0].data.params[0].expr, "@numeric");
    assert.equal(requests.length, 1);
});

test("parameter callbacks are stable through dragging and retained callbacks read live edits", async () => {
    await open();
    const update = current.actions.updateNodeParameter;
    const getSource = current.actions.getNodeParameterEditSource;
    await React.act(async () => current.graph.onNodesChange([{ id: "skill", type: "position", position: { x: 300, y: 400 } }]));
    assert.equal(current.actions.updateNodeParameter, update);
    assert.equal(current.actions.getNodeParameterEditSource, getSource);
    await React.act(async () => update("skill", 0, "", true));
    assert.deepEqual(current.graph.nodes[0].position, { x: 300, y: 400 });
    assert.equal(current.graph.nodes[0].data.params[0].expr, "");
});

test("keyed blur commits survive live parameter reorder without changing siblings", async () => {
    const flag = { key: "flag", type: "Boolean", expr: "true" };
    await open(documentWith("a", [skill({ params: [{ key: "count", type: "Integer", expr: "7" }, flag] })]));
    const target = input();
    await focus(target);
    await type(target, "");
    await React.act(async () => {
        editNode((node) => ({ ...node, data: { ...node.data, params: [flag, node.data.params[0]] } }));
        target.blur();
    });
    assert.equal(current.graph.nodes[0].data.params[0], flag);
    assert.equal(current.graph.nodes[0].data.params[1].expr, "");
    assert.equal(input().value, "");
    assert.equal(requests.length, 1);
});

for (const [name, change] of [
    ["source", (node) => ({ ...node, data: { ...node.data, src: "${BEH}/new.xml" } })],
    ["skill", (node) => ({ ...node, data: { ...node.data, fullSkillName: "library.Other#instance" } })],
    ["semantic identity", (node) => ({ ...node, data: { ...node.data, scxmlStateId: "other" } })],
    ["clone identity", (node) => ({ ...node, data: { ...node.data, isSkillClone: true, cloneOfNodeId: "other" } })],
    ["removed key", (node) => ({ ...node, data: { ...node.data, params: [{ key: "replacement", type: "Integer", expr: "4" }] } })],
]) {
    test(`a draft's ${name} change before blur cannot write into the replacement source`, async () => {
        await open();
        const target = input();
        await focus(target);
        await type(target, "");
        let snapshot;
        await React.act(async () => {
            editNode(change);
            snapshot = current.graph.getDocumentSnapshot();
            target.blur();
        });
        assert.equal(commits.at(-1).result, null);
        assert.equal(current.graph.getDocumentSnapshot(), snapshot);
        assert.equal(requests.length, 0);
        assert.equal(parameterCommands().length, 0);
    });
}

for (const change of ["switch", "switch-back", "replace"]) {
    test(`origin document tokens reject a stale blur after ${change}`, async () => {
        await open();
        const target = input();
        await focus(target);
        await type(target, "");
        await React.act(async () => {
            if (change === "replace") current.tabs.replaceTabDocument("a", documentWith("a"));
            else {
                current.tabs.openTab(documentWith("b"), { fit: false });
                if (change === "switch-back") current.tabs.switchTab("a");
            }
            target.blur();
        });
        await flushFrames();
        assert.equal(commits.at(-1).result, null);
        assert.equal(current.graph.nodes[0].data.params[0].expr, "7");
        assert.equal(requests.length, 0);
        assert.equal(parameterCommands().length, 0);
    });
}

test("Enter and its synchronous blur emit one editor commit, API request and native parameter command", async () => {
    await open();
    await focus(input());
    await type(input(), "");
    await key(input(), "Enter");
    assert.equal(commits.length, 1);
    assert.equal(requests.length, 1);
    assert.equal(parameterCommands().length, 1);
    await focus(input());
    await blur(input());
    assert.equal(requests.length, 1, "unchanged re-focus/blur is not another semantic command");
    assert.equal(parameterCommands().length, 1);
});

test("the full DetailsPanel and stable callback facade retain the origin getter and legacy callback arguments", async () => {
    await open();
    await React.act(async () => root.render(React.createElement(React.StrictMode, null,
        React.createElement(Harness, { withDetails: true }))));
    await focus(input());
    await type(input(), "");
    await key(input(), "Enter");
    assert.equal(commits.length, 1);
    assert.equal(commits[0].index, 0);
    assert.equal(commits[0].value, "");
    assert.equal(commits[0].commit, true);
    assert.equal(commits[0].source.nodeId, "skill");
    assert.equal(commits[0].source.parameterKey, "count");
    assert.equal(commits[0].source.documentIdentity, current.tabs.getActiveDocumentIdentity());
    assert.equal(current.graph.nodes[0].data.params[0].expr, "");
});

for (const newestFirst of [false, true]) {
    test(`older parameterized API replies cannot restore a clear when ${newestFirst ? "newest" : "oldest"} replies first`, async () => {
        await open();
        await React.act(async () => current.actions.updateNodeParameter("skill", 0, "9", true));
        const older = requests[0];
        await focus(input());
        await type(input(), "");
        await key(input(), "Enter");
        const cleared = requests[1];
        assert.deepEqual(cleared.params, {});
        const before = current.graph.getDocumentSnapshot();
        const oldDefinition = { params: [{ key: "count", type: "Integer", default: 3, expr: "9" }], events: [{ event: "old" }] };
        const clearDefinition = { params: [{ key: "count", type: "Integer", default: 3 }], events: [{ event: "done" }] };
        if (newestFirst) {
            await reply(cleared, clearDefinition);
            const accepted = current.graph.getDocumentSnapshot();
            await reply(older, oldDefinition);
            assert.equal(current.graph.getDocumentSnapshot(), accepted);
        } else {
            await reply(older, oldDefinition);
            assert.equal(current.graph.getDocumentSnapshot(), before);
            await reply(cleared, clearDefinition);
        }
        assert.equal(current.graph.nodes[0].data.params[0].expr, "");
        assert.equal(current.graph.nodes[0].data.params[0].default, 3);
        assert.equal(current.graph.nodes[0].data.events[0].id, "done");
        assert.equal(current.graph.nodes[0].data.events[0].target, "target");
        assert.equal(current.graph.nodes[0].data.inSlots[0].path, "/input");
        await flushFrames();
        assert.equal(slotCalls.length, 1);
        assert.equal(input().value, "");
    });
}

test("an API reply accepted before clear cannot use its deferred slot frame to revive the value", async () => {
    await open();
    await React.act(async () => current.actions.updateNodeParameter("skill", 0, "9", true));
    await reply(requests[0], { params: [{ key: "count", type: "Integer", default: 3 }], events: [{ event: "done" }] });
    assert.ok(frames.size);
    await focus(input());
    await type(input(), "");
    await key(input(), "Enter");
    await flushFrames();
    assert.equal(slotCalls.length, 0, "the existing dynamic guard must discard the older pending frame");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "");
});

test("zero and false input/metadata are displayed, defaults stay placeholders, and clears remain allowed", async () => {
    await open(documentWith("a", [skill({ params: [
        { key: "count", type: "Integer", expr: 0, default: 0, required: true },
        { key: "flag", type: "Boolean", expr: false, default: false },
    ] })]));
    assert.equal(input().value, "0");
    assert.equal(input("flag").value, "false");
    assert.equal(input().placeholder, "0");
    assert.equal(input("flag").placeholder, "false");
    await focus(input());
    await type(input(), "");
    await key(input(), "Enter");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "");
    assert.equal(current.graph.nodes[0].data.params[0].default, 0);
    assert.equal(current.graph.nodes[0].data.params[1].expr, false);
    assert.deepEqual(requests[0].params, { flag: false });
    await focus(input("flag"));
    await type(input("flag"), "");
    await key(input("flag"), "Enter");
    assert.deepEqual(requests[1].params, {});
});

test("string normalization runs once on Enter/blur and quotes/backslashes remain in the graph model", async () => {
    await open(documentWith("a", [skill({ params: [{ key: "text", type: "String", expr: "'old'", default: "fallback" }] })]));
    await focus(input("text"));
    await type(input("text"), "a'b\\c");
    await key(input("text"), "Enter");
    assert.equal(commits.length, 1);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "'a\\'b\\\\c'");
    assert.equal(JSON.parse(JSON.stringify(current.graph.getDocumentSnapshot())).nodes[0].data.params[0].expr, "'a\\'b\\\\c'");
    assert.equal(input("text").value, "'a\\'b\\\\c'");
    assert.equal(requests.length, 1);
});

test("variable type changes invalidate an existing draft, while clearing it remains valid", async () => {
    await open(documentWith("a", [skill()], [{ id: "numeric", type: "Integer", expr: "1" }]));
    await focus(input());
    await type(input(), "@numeric");
    await React.act(async () => current.graph.setGlobalDataModel([{ id: "numeric", type: "String", expr: "'changed'" }]));
    await blur(input());
    assert.equal(input().value, "@numeric");
    assert.match(container.querySelector(".typed-value-error").textContent, /String.*Integer/);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "7");
    assert.equal(requests.length, 0);
    await focus(input());
    await type(input(), "");
    await key(input(), "Enter");
    assert.equal(current.graph.nodes[0].data.params[0].expr, "");
});

test("same-frame parameter schema changes are revalidated at the write boundary", async () => {
    await open();
    const target = input();
    await focus(target);
    await type(target, "9");
    await React.act(async () => {
        editNode((node) => ({ ...node, data: { ...node.data,
            params: node.data.params.map((param) => ({ ...param, type: "Boolean" })),
        } }));
        target.blur();
    });
    assert.equal(commits.at(-1).result, null);
    assert.equal(current.graph.nodes[0].data.params[0].expr, "7");
    assert.equal(parameterCommands().length, 0);
    assert.equal(requests.length, 0);
});

test("typed editor honors callback rejection, preserves draft feedback, and allows correction or Escape", async () => {
    let accepted = false;
    const emitted = [];
    const draftChanges = [];
    await React.act(async () => root.render(React.createElement(modules.TypedValueEditor, {
        value: "7", expectedType: "Integer", onDraftChange: (value) => draftChanges.push(value),
        onCommit: (value) => { emitted.push(value); return accepted ? undefined : null; },
    })));
    const target = container.querySelector("input");
    await focus(target);
    await type(target, " 9 ");
    await key(target, "Enter");
    assert.equal(target.value, " 9 ", "a rejected callback must not display its normalized draft as accepted");
    assert.equal(target.getAttribute("aria-invalid"), "true");
    assert.match(container.querySelector(".typed-value-error").textContent, /not applied/i);
    assert.deepEqual(draftChanges, [" 9 "]);
    assert.equal(window.document.activeElement, target);
    await key(target, "Escape");
    assert.equal(target.value, "7");
    assert.equal(target.getAttribute("aria-invalid"), "false");
    assert.deepEqual(emitted, ["9"]);
    accepted = true;
    await focus(target);
    await type(target, "8");
    await key(target, "Enter");
    assert.deepEqual(emitted, ["9", "8"], "legacy void callbacks still accept, without Enter/blur duplication");
});

test("external resets with equal old values discard dirty drafts without hover resets or default writes", async () => {
    await open();
    const target = input();
    await focus(target);
    await type(target, "bad");
    await blur(target);
    await React.act(async () => current.graph.onNodesChange([{ id: "skill", type: "position", position: { x: 90, y: 80 } }]));
    assert.equal(target.value, "bad");
    assert.equal(target.getAttribute("aria-invalid"), "true");
    await React.act(async () => editNode((node) => ({ ...node, data: { ...node.data,
        params: node.data.params.map((param) => ({ ...param, expr: "7", default: 0 })),
    } })));
    assert.equal(input(), target);
    assert.equal(target.value, "7");
    assert.equal(target.getAttribute("aria-invalid"), "false");
    await focus(target);
    await type(target, "bad");
    await key(target, "Escape");
    assert.equal(target.value, "7");
    assert.equal(requests.length, 0);
    assert.equal(parameterCommands().length, 0);
});

test("controlled draft echoes retain autocomplete and selection commits once", async () => {
    const emitted = [];
    function Controlled() {
        const [value, setValue] = React.useState("");
        return React.createElement(modules.TypedValueEditor, { value, expectedType: "Boolean",
            onDraftChange: setValue, onCommit: (next) => emitted.push(next) });
    }
    await React.act(async () => root.render(React.createElement(Controlled)));
    const target = container.querySelector("input");
    await focus(target);
    await type(target, "fal");
    assert.equal(target.getAttribute("aria-expanded"), "true");
    await key(target, "Enter");
    assert.deepEqual(emitted, ["false"]);
    await blur(target);
    assert.deepEqual(emitted, ["false"]);
    assert.equal(target.value, "false");
});

test("Escape cancels controlled draft echoes rather than committing the last echoed prop", async () => {
    const emitted = [];
    function Controlled() {
        const [value, setValue] = React.useState("7");
        return React.createElement(modules.TypedValueEditor, { value, expectedType: "Integer",
            onDraftChange: setValue, onCommit: (next) => emitted.push(next) });
    }
    await React.act(async () => root.render(React.createElement(Controlled)));
    const target = container.querySelector("input");
    await focus(target);
    await type(target, "9");
    await key(target, "Escape");
    await blur(target);
    assert.equal(target.value, "7");
    assert.deepEqual(emitted, []);
});

for (const [name, reject] of [
    ["false", () => false], ["validation result", () => ({ valid: false, error: "Source changed." })],
    ["throw", () => { throw new Error("Write rejected."); }],
]) {
    test(`typed commit ${name} rejection retains honest inline feedback`, async () => {
        await React.act(async () => root.render(React.createElement(modules.TypedValueEditor, {
            value: "7", expectedType: "Integer", onCommit: reject,
        })));
        const target = container.querySelector("input");
        await focus(target);
        await type(target, " 9 ");
        await key(target, "Enter");
        assert.equal(target.value, " 9 ");
        assert.equal(target.getAttribute("aria-invalid"), "true");
        assert.ok(container.querySelector(".typed-value-error").textContent);
        assert.equal(window.document.activeElement, target);
    });
}

test("an untouched required typed field still validates empty blur without emitting a commit", async () => {
    const emitted = [];
    await React.act(async () => root.render(React.createElement(modules.TypedValueEditor, {
        value: "", expectedType: "Integer", allowEmpty: false, onCommit: (value) => emitted.push(value),
    })));
    const target = container.querySelector("input");
    await focus(target);
    await blur(target);
    assert.equal(target.getAttribute("aria-invalid"), "true");
    assert.match(container.querySelector(".typed-value-error").textContent, /required/);
    assert.deepEqual(emitted, []);
});
