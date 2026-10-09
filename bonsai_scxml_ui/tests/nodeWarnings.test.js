import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, startTransition, StrictMode, Suspense, useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { Window } from "happy-dom";

const noop = () => {};
const skill = (id, parameters = [], extra = {}) => ({
    id, type: "custom", position: { x: 20, y: 30 }, width: 320, height: 240,
    data: { label: id, fullSkillName: `pkg.${id}`, params: parameters,
        events: [{ id: "success" }, { id: "error.detail" }], inSlots: [], outSlots: [], ...extra },
});
const parameterProblem = (nodeId = "skill", message = "pkg.skill.count: Integer requires an Integer literal or parameter.") => ({
    id: `parameter-type-${nodeId}-0`, nodeId, severity: "error", category: "Parameters",
    title: "Invalid parameter type", message, detailTab: "parameter", mode: "event", focusNodeIds: [nodeId],
});
const slotProblem = { id: "slot-input-empty-skill-0", nodeId: "skill", severity: "warning", category: "Slots",
    title: "Input slot is not connected", message: "pkg.skill.input has no slot path.", detailTab: "slots", mode: "overview" };
const transitionProblem = { id: "transition-missing-skill-fatal", nodeId: "skill", severity: "warning", category: "Transitions",
    title: "Missing transition", message: "pkg.skill.fatal has no transition.", focusNodeIds: ["skill", "target"] };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

test("real analysis and display hooks keep native node warnings owned, cached and separate from browser feedback", { timeout: 60000 }, async (t) => {
    const window = new Window({ url: "http://localhost/" });
    const originals = new Map();
    const timers = new Map();
    const frames = new Map();
    const errors = [];
    let timerId = 0;
    let root;
    let server;
    let latest;
    let inputs;
    let documentIdentity;
    let validationReply;
    let ancestryReply;
    let calls = [];
    let queryKeys = [];
    const getActiveDocumentIdentity = () => documentIdentity;
    const runRustReadQuery = (key, query) => { queryKeys.push(key); return query(); };
    const originalError = console.error;
    console.error = (...args) => { errors.push(args); };
    window.setTimeout = (callback, delay) => {
        const id = ++timerId;
        timers.set(id, { callback, delay });
        return id;
    };
    window.clearTimeout = (id) => timers.delete(id);
    window.requestAnimationFrame = (callback) => {
        const id = ++timerId;
        frames.set(id, callback);
        return id;
    };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    for (const [name, value] of Object.entries({
        window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const container = window.document.createElement("div");
    const nodeDom = window.document.createElement("div");
    window.document.body.append(container, nodeDom);

    try {
        const { createRoot } = await import("react-dom/client");
        const { createServer } = await import("vite");
        const { default: react } = await import("@vitejs/plugin-react");
        server = await createServer({
            configFile: false, plugins: [react()], appType: "custom",
            server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
            optimizeDeps: { noDiscovery: true, include: [] },
        });
        const modules = await Promise.all([
            "/src/hooks/graph/useEditorGraphMaintenance.js", "/src/hooks/graph/useEditorPresentationGraph.js",
            "/src/hooks/graph/useEditorAnalysis.js", "/src/hooks/graph/useEditorDisplay.js",
            "/src/components/graph/StateNodes.jsx", "/src/utils/scxmlRustExport.js",
        ].map((path) => server.ssrLoadModule(path)));
        const hooks = Object.assign({}, ...modules);
        function Harness({ value, suspend }) {
            const semanticNodes = hooks.useSemanticNodeSnapshot(value.nodes, value.isDraggingNode);
            const presentation = hooks.useEditorPresentationGraph({ ...value, semanticNodes });
            const analysis = hooks.useEditorAnalysis({ ...value, ...presentation, semanticNodes });
            const display = hooks.useEditorDisplay({ ...value, ...presentation, ...analysis, semanticNodes });
            useLayoutEffect(() => { latest = { ...presentation, ...analysis, ...display, semanticNodes }; });
            if (suspend) throw suspend;
            return null;
        }
        const render = async (value = inputs, options = {}) => {
            await act(async () => {
                const component = createElement(StrictMode, null,
                    createElement(Suspense, { fallback: "pending" }, createElement(Harness, { value, suspend: options.suspend })));
                if (options.transition) startTransition(() => root.render(component));
                else root.render(component);
            });
            return latest;
        };
        const mount = async (native = true) => {
            if (root) await act(async () => root.unmount());
            timers.clear();
            frames.clear();
            calls = [];
            queryKeys = [];
            errors.length = 0;
            documentIdentity = { id: "root", documentGeneration: 1, activationGeneration: 1 };
            validationReply = () => [];
            ancestryReply = () => ({ byPath: {} });
            if (native) window.__TAURI_INTERNALS__ = { invoke: (name, args) => {
                if (name === "validate_active_workflow") {
                    calls.push(args.request);
                    return Promise.resolve(validationReply(args.request));
                }
                assert.equal(name, "resolve_active_editor_slot_ancestry");
                return Promise.resolve(ancestryReply(args.request));
            } };
            else delete window.__TAURI_INTERNALS__;
            inputs = {
                nodes: [skill("skill", [{ key: "count", type: "Integer", expr: "'text'" }]), skill("target")],
                edges: [], slotNodes: [], slotEdges: [], manualSlots: [],
                tabs: [{ id: "root" }], activeTabId: "root", selectedRawNode: null,
                globalDataModel: [], availableDataModel: [], behaviorDirectories: [],
                selectedNodes: [], selectedNodeId: null, hoveredEditorNodeId: null, hoveredEditorEdgeId: null,
                hoveredSlotAccessNodeId: null, activeMode: "overview", showSlotEdges: true,
                isDraggingNode: false, draggingNodeId: null, slotConnectionDrag: null,
                problemNodeIds: new Set(), parallelDropTargetId: null, compoundDropTargetId: null,
                updatePersistentEdgeControlPoints: noop, getActiveDocumentIdentity, runRustReadQuery, validationRevision: 0,
            };
            root = createRoot(container);
            await render();
        };
        const flush = async (delay) => {
            await act(async () => {
                for (const [id, entry] of [...timers]) {
                    if (entry.delay !== delay) continue;
                    timers.delete(id);
                    entry.callback();
                }
            });
        };
        const validate = async () => { await flush(30); await flush(100); };
        const badge = (id = "skill") => {
            const node = latest.visibleNodes.find((entry) => entry.id === id);
            assert.ok(node);
            nodeDom.innerHTML = renderToStaticMarkup(createElement(ReactFlowProvider, { initialNodes: [node] },
                createElement(ReactFlow, { nodes: [node], nodeTypes: { custom: hooks.SkillNode, submachine: hooks.SubMachineNode }, width: 800, height: 600 })));
            return nodeDom.querySelector(".node-warning-badge");
        };

        await t.test("ignored native transitions disappear while parameter/slot diagnostics and only their owners retain badges", async () => {
            await mount();
            inputs = { ...inputs, nodes: [skill("skill", [{ key: "count", type: "Integer", expr: "'text'" }], {
                inSlots: [{ key: "input", type: "String", path: "" }],
                unexposedTransitionHandles: ["ignored.unknown"], outgoingTransitionHandles: [],
            }), inputs.nodes[1]] };
            validationReply = () => [transitionProblem, parameterProblem(), slotProblem];
            await render();
            assert.equal(latest.validationStatus, "pending");
            await validate();
            assert.equal(latest.validationStatus, "ready");
            assert.match(badge().title, /Missing transition/);
            assert.match(badge().title, /Invalid parameter type/);
            assert.equal(badge("target"), null, "focusNodeIds are navigation context, not diagnostic ownership");
            const beforeSource = inputs.nodes[0].data;
            inputs = { ...inputs, globalDataModel: [{ id: "#_VALIDATE_IGNORE_THESE_STATES", expr: "'skill; Other'" }] };
            validationReply = () => [slotProblem, parameterProblem()];
            await render();
            assert.equal(latest.validationStatus, "pending");
            assert.equal(badge(), null, "old root-setting diagnostics hide before the native query returns");
            await validate();
            assert.equal(latest.editorProblems.length, 2);
            assert.equal(latest.errorProblemCount, 1);
            assert.match(badge().title, /Invalid parameter type/);
            assert.match(badge().title, /Input slot is not connected/);
            assert.doesNotMatch(badge().title, /transition|unexposed/i);
            assert.equal(inputs.nodes[0].data, beforeSource);
            assert.equal(inputs.nodes[0].data.editorWarningTitle, undefined);
            assert.equal(latest.injectedNodes[0].data.editorWarningTitle, undefined);
            assert.equal(calls.at(-1).nodeOverlays[0].parameters[0].typeName, "Integer");
            assert.equal(calls.at(-1).nodeOverlays[0].editorWarningTitle, undefined);
        });

        await t.test("an imported invalid committed Integer gets a badge and corrected current metadata/value clears it", async () => {
            await mount();
            validationReply = () => [parameterProblem()];
            await validate();
            assert.ok(badge().querySelector("svg"), "the actual NodeWarning exclamation glyph is present");
            assert.equal(latest.nodeWarningTitles.get("skill"), `${latest.editorProblems[0].title}: ${latest.editorProblems[0].message}`);
            const changed = { ...inputs.nodes[0], data: { ...inputs.nodes[0].data,
                params: [{ key: "count", type: "Integer", expr: "7" }] } };
            inputs = { ...inputs, nodes: [changed, inputs.nodes[1]] };
            validationReply = () => [];
            await render();
            await validate();
            assert.equal(badge(), null);
            assert.equal(latest.validationStatus, "ready");
            assert.equal(latest.editorProblems.length, 0);
            inputs = { ...inputs, nodes: [{ ...changed, data: { ...changed.data,
                params: [{ key: "count", type: "String", expr: "'text'" }] } }, inputs.nodes[1]] };
            await render();
            await validate();
            assert.equal(calls.at(-1).nodeOverlays[0].parameters[0].typeName, "String", "current API type, not a guessed baseline Integer, is sent to native");
            assert.equal(badge(), null);
        });

        await t.test("fresh equivalent native Problem arrays retain the warning Map and UI objects across revision refreshes", async (t) => {
            await mount();
            const other = parameterProblem("target", "pkg.target.flag requires Boolean.");
            validationReply = () => [parameterProblem(), other];
            await validate();
            const before = latest;
            inputs = { ...inputs, validationRevision: 1 };
            validationReply = () => [other, parameterProblem()].map((problem) => ({ ...problem, focusNodeIds: [...problem.focusNodeIds] }));
            await render();
            assert.equal(latest.validationStatus, "pending");
            assert.equal(latest.nodeWarningTitles, before.nodeWarningTitles);
            assert.equal(latest.visibleNodes, before.visibleNodes);
            await validate();
            assert.equal(latest.validationStatus, "ready");
            assert.equal(latest.nodeWarningTitles, before.nodeWarningTitles);
            assert.equal(latest.visibleNodes, before.visibleNodes);
            const unchanged = latest;
            validationReply = () => [other, parameterProblem("skill", "Changed current diagnostic")];
            inputs = { ...inputs, validationRevision: 2 };
            await render();
            await validate();
            assert.notEqual(latest.visibleNodes[0], unchanged.visibleNodes[0]);
            assert.equal(latest.visibleNodes[1], unchanged.visibleNodes[1]);
            assert.equal(latest.visibleNodes[1].data, unchanged.visibleNodes[1].data);
            assert.equal(latest.injectedNodes, unchanged.injectedNodes);
            assert.equal(latest.semanticNodes, unchanged.semanticNodes);
            assert.equal(latest.smartRoutingNodes, unchanged.smartRoutingNodes);
            t.diagnostic("Fresh equal native diagnostics: same Map + displayed array/nodes; one changed owner: exactly 1 UI node/data replacement");
        });

        await t.test("root configuration changes reject stale native replies even when available globals and the revision stay unchanged", async () => {
            await mount();
            const old = deferred();
            validationReply = () => old.promise;
            await validate();
            const available = inputs.availableDataModel;
            inputs = { ...inputs, globalDataModel: [{ id: "#_VALIDATE_IGNORE_THESE_STATES", expr: '"skill"' }] };
            validationReply = () => [parameterProblem(), slotProblem];
            await render();
            assert.equal(inputs.availableDataModel, available);
            await validate();
            const current = latest;
            await act(async () => old.resolve([transitionProblem]));
            assert.equal(latest, current);
            assert.doesNotMatch(badge().title, /Missing transition/);
            assert.equal(calls.length, 2);
            const obsoleteFailure = deferred();
            validationReply = () => obsoleteFailure.promise;
            inputs = { ...inputs, validationRevision: 1 };
            await render();
            await validate();
            inputs = { ...inputs, globalDataModel: [{ id: "#_VALIDATE_IGNORE_THESE_STATES", expr: "skill; Other" }] };
            validationReply = () => [slotProblem];
            await render();
            await validate();
            await act(async () => obsoleteFailure.reject(new Error("Old validation failed")));
            assert.equal(latest.validationStatus, "ready");
            assert.equal(latest.errorProblemCount, 0);
            assert.deepEqual(errors, [], "stale failures do not overwrite or report current validation");
        });

        await t.test("tab activation and same-ID document generations hide old badges and discard late query/ancestry results", async () => {
            await mount();
            validationReply = () => [parameterProblem()];
            ancestryReply = () => ({ byPath: { input: [{ hierarchyKind: "writer", nodeId: "old-parent" }] } });
            await validate();
            assert.ok(latest.ancestorSlotSourcesByPath.has("input"));
            assert.ok(badge());
            const stale = deferred();
            const staleAncestry = deferred();
            validationReply = () => stale.promise;
            ancestryReply = () => staleAncestry.promise;
            inputs = { ...inputs, validationRevision: 1 };
            await render();
            await validate();
            documentIdentity = { id: "other", documentGeneration: 1, activationGeneration: 2 };
            inputs = { ...inputs, tabs: [{ id: "root" }, { id: "other" }], activeTabId: "other" };
            validationReply = () => [];
            ancestryReply = () => ({ byPath: {} });
            await render();
            assert.equal(badge(), null);
            assert.equal(latest.ancestorSlotSourcesByPath.size, 0);
            await validate();
            await act(async () => {
                stale.resolve([parameterProblem("skill", "Old tab")]);
                staleAncestry.resolve({ byPath: { input: [{ hierarchyKind: "writer", nodeId: "old-parent" }] } });
            });
            assert.equal(badge(), null);
            assert.equal(latest.ancestorSlotSourcesByPath.size, 0);
            const leaving = deferred();
            validationReply = () => leaving.promise;
            inputs = { ...inputs, validationRevision: 2 };
            await render();
            await validate();
            documentIdentity = { id: "root", documentGeneration: 1, activationGeneration: 3 };
            inputs = { ...inputs, activeTabId: "root" };
            validationReply = () => [slotProblem];
            await render();
            await validate();
            await act(async () => leaving.resolve([parameterProblem("skill", "Old activation")]));
            assert.equal(latest.editorProblems[0].id, slotProblem.id);
            const beforeReplacement = deferred();
            validationReply = () => beforeReplacement.promise;
            inputs = { ...inputs, validationRevision: 3 };
            await render();
            await validate();
            documentIdentity = { id: "root", documentGeneration: 2, activationGeneration: 4 };
            await act(async () => beforeReplacement.resolve([transitionProblem]));
            assert.equal(latest.editorProblems[0].id, slotProblem.id, "getter fences publication even before a replacement renders");
            validationReply = () => [];
            await render();
            assert.equal(badge(), null);
            assert.equal(latest.validationStatus, "pending");
            await validate();
            assert.equal(latest.validationStatus, "ready");
        });

        await t.test("unavailable, failed, malformed and discarded validation are never a clean full-workflow result", async () => {
            await mount();
            validationReply = () => { throw new Error("Native unavailable"); };
            await validate();
            assert.equal(latest.validationStatus, "error");
            assert.equal(latest.editorProblems[0].id, "rust-validation-failed");
            assert.equal(latest.nodeWarningTitles.size, 0, "desktop failure must not invent local parameter/transition diagnostics");
            inputs = { ...inputs, validationRevision: 1 };
            validationReply = () => ({ issues: [] });
            await render();
            await validate();
            assert.equal(latest.validationStatus, "error");
            assert.match(latest.editorProblems[0].message, /invalid Problems response/);
            inputs = { ...inputs, validationRevision: 2, runRustReadQuery: (key, query) => key === "validation" ? Promise.resolve(null) : query() };
            await render();
            await validate();
            assert.equal(latest.validationStatus, "pending", "the native queue's stale null reply is not a clean validation result");
            await mount(false);
            assert.equal(latest.validationStatus, "unavailable");
            assert.equal(queryKeys.length, 0);
            assert.ok(badge(), "browser keeps scalar feedback for invalid committed values without claiming native validation");
        });

        await t.test("browser scalar feedback reuses the shared validator for quoted text, defaults, references and current API types", async () => {
            await mount(false);
            const cases = [
                ["text", "Integer", "text", "", true], ["single-quote", "Integer", "'7'", "", true],
                ["double-quote", "Integer", '"7"', "", true], ["default-text", "Integer", " ", "text", true],
                ["decimal", "Integer", "1.5", "", true], ["ref-string", "Integer", "@shared", "", true],
                ["ref-unknown", "Integer", "@missing", "", true], ["ref-partial", "Integer", "@", "", true],
                ["integer", "Integer", "0", "", false], ["default-integer", "Integer", "", "2", false],
                ["ref-integer", "Integer", "@globalCount", "", false], ["widen", "Double", "@globalCount", "", false],
                ["string", "String", "'7'", "", false], ["boolean", "Boolean", "false", "", false],
                ["domain", "robot.DomainValue", "whatever", "", false], ["optional", "Integer", "", "", false],
            ];
            const globals = [{ id: "shared", valueType: "String", expr: "'text'" }, { id: "globalCount", valueType: "Integer", expr: "3" }];
            inputs = { ...inputs, globalDataModel: globals, availableDataModel: globals, nodes: cases.map(([id, type, expr, defaultValue]) =>
                skill(id, [{ key: "value", type, expr, default: defaultValue }])) };
            const snapshot = hooks.buildRustEditorExportRequest(inputs);
            await render();
            for (const [id, , , , invalid] of cases) {
                assert.equal(Boolean(badge(id)), invalid, id);
                assert.equal(inputs.nodes.find((node) => node.id === id).data.editorWarningTitle, undefined);
            }
            assert.deepEqual(hooks.buildRustEditorExportRequest(inputs), snapshot, "feedback never normalizes or persists the committed source");
            inputs = { ...inputs, nodes: [
                skill("globals-first", [{ key: "shared", type: "Integer", expr: "4" }, { key: "count", type: "Integer", expr: "@shared" }]),
                skill("local-default", [{ key: "seed", type: "Integer", expr: "", default: "2" }, { key: "count", type: "Integer", expr: "@seed" }]),
                skill("required-domain", [{ key: "missing", type: "robot.DomainValue", required: true, expr: "" }]),
                skill("slot", [], { inSlots: [{ key: "input", path: "", type: "String" }] }),
                skill("transitions-only", [], { unexposedTransitionHandles: ["unknown"], outgoingTransitionHandles: [] }),
                skill("alias", [{ key: "count", type: "Integer", expr: "text" }], { cloneOfNodeId: "local-default", isSkillClone: true }),
            ] };
            await render();
            assert.match(badge("globals-first").title, /shared is String/);
            assert.equal(badge("local-default"), null);
            assert.match(badge("required-domain").title, /Required parameter is missing/);
            assert.match(badge("slot").title, /Input slot is not connected/);
            assert.equal(badge("transitions-only"), null, "no frontend transition validator in browser mode");
            assert.equal(badge("alias"), null);
            assert.equal(latest.validationStatus, "unavailable");
            assert.equal(calls.length, 0);
            assert.deepEqual(errors, []);
        });

        await t.test("suspended warning sources cannot contaminate a committed current source under StrictMode", async () => {
            await mount();
            validationReply = () => [parameterProblem()];
            await validate();
            const before = latest;
            await render({ ...inputs, globalDataModel: [{ id: "#_VALIDATE_IGNORE_THESE_STATES", expr: "skill" }] },
                { transition: true, suspend: new Promise(() => {}) });
            assert.equal(latest, before);
            await render({ ...inputs, hoveredEditorNodeId: "target" });
            assert.equal(latest.nodeWarningTitles, before.nodeWarningTitles);
            assert.equal(latest.semanticNodes, before.semanticNodes);
            assert.match(badge().title, /Invalid parameter type/);
            assert.deepEqual(errors, []);
        });

        await t.test("840-node hover, selection and drag retain diagnostic caches with zero semantic/edge visits or native queries", async (t) => {
            await mount();
            const nodes = Array.from({ length: 840 }, (_, index) => skill(`n${index}`));
            const edges = nodes.map((node, index) => ({ id: `e${index}`, source: node.id,
                target: nodes[(index + 1) % nodes.length].id, sourceHandle: "success", data: {} }));
            let nodeVisits = 0;
            let edgeVisits = 0;
            nodes.every = (callback) => Array.prototype.every.call(nodes, (...args) => { nodeVisits += 1; return callback(...args); });
            edges.forEach = (callback) => Array.prototype.forEach.call(edges, (...args) => { edgeVisits += 1; return callback(...args); });
            inputs = { ...inputs, nodes, edges };
            validationReply = () => [parameterProblem("n420")];
            await render();
            await validate();
            const before = latest;
            const nativeQueries = calls.length;
            const allQueries = queryKeys.length;
            nodeVisits = 0;
            edgeVisits = 0;
            for (let count = 0; count < 12; count += 1) {
                await render({ ...inputs, hoveredEditorNodeId: `n${count % 2}`, selectedNodeId: "n420" });
                assert.equal(latest.nodeWarningTitles, before.nodeWarningTitles);
                assert.equal(latest.visibleNodes[800], before.visibleNodes[800]);
                assert.equal(latest.visibleEdges[800], before.visibleEdges[800]);
                assert.equal(latest.injectedNodes, before.injectedNodes);
                assert.equal(latest.smartRoutingNodes, before.smartRoutingNodes);
                assert.equal(latest.nodeById, before.nodeById);
            }
            await render({ ...inputs, isDraggingNode: true, draggingNodeId: "n0" });
            await validate();
            assert.equal(latest.nodeWarningTitles, before.nodeWarningTitles);
            assert.equal(nodeVisits, 0);
            assert.equal(edgeVisits, 0);
            assert.equal(calls.length, nativeQueries);
            assert.equal(queryKeys.length, allQueries);
            t.diagnostic("Full presentation + analysis + display, 840 nodes/edges, 12 hover/selection updates + drag: 0 semantic visits, 0 edge visits, 0 native queries; warning Map/unrelated nodes/edges/routing retained");
            assert.deepEqual(errors, []);
        });
    } finally {
        if (root) await act(async () => root.unmount());
        if (server) await server.close();
        container.remove();
        nodeDom.remove();
        timers.clear();
        frames.clear();
        await window.happyDOM.abort();
        console.error = originalError;
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
});
