import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, startTransition, StrictMode, Suspense, useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { Window } from "happy-dom";

import { projectSemanticNodes, useDerivedGraphSnapshot, useSemanticNodeSnapshot } from "../src/hooks/graph/useEditorGraphMaintenance.js";
import { projectOutgoingTransitionHandles, useEditorPresentationGraph } from "../src/hooks/graph/useEditorPresentationGraph.js";
import { projectRoutingNodes, projectStructureEdges, useEditorDisplay } from "../src/hooks/graph/useEditorDisplay.js";

function node(id, extra = {}) {
    return { id, type: "custom", position: { x: 10, y: 20 }, data: { label: id }, ...extra };
}

function edge(id, extra = {}) {
    return { id, source: "a", target: "b", sourceHandle: "success", data: {}, ...extra };
}

test("semantic projection ignores selection, dimensions and live geometry", () => {
    const nodes = [node("a"), node("b", { parentId: "a" })];
    const snapshot = projectSemanticNodes([], nodes);
    const moved = nodes.map((entry) => ({
        ...entry,
        selected: true,
        dragging: true,
        measured: { width: 200, height: 80 },
        position: { x: 400, y: 500 },
    }));
    assert.equal(projectSemanticNodes(snapshot, moved), snapshot);
    assert.deepEqual(snapshot[0], { id: "a", type: "custom", parentId: undefined, data: nodes[0].data });
});

test("semantic projection freezes during drag and catches topology/data changes on drop", () => {
    const nodes = [node("a"), node("b")];
    const snapshot = projectSemanticNodes([], nodes);
    const changed = [nodes[0], { ...nodes[1], parentId: "a", data: { label: "Updated" } }];
    assert.equal(projectSemanticNodes(snapshot, changed, true), snapshot);
    const dropped = projectSemanticNodes(snapshot, changed, false);
    assert.notEqual(dropped, snapshot);
    assert.equal(dropped[1].parentId, "a");
    assert.equal(dropped[1].data, changed[1].data);
    assert.equal(projectSemanticNodes(dropped, changed), dropped);
});

test("semantic projection includes slot parentage, node type, ordering and removals", () => {
    const nodes = [node("slot", { type: "slot" }), node("a")];
    const snapshot = projectSemanticNodes([], nodes);
    assert.notEqual(projectSemanticNodes(snapshot, [{ ...nodes[0], parentId: "a" }, nodes[1]]), snapshot);
    assert.notEqual(projectSemanticNodes(snapshot, [{ ...nodes[0], type: "custom" }, nodes[1]]), snapshot);
    assert.notEqual(projectSemanticNodes(snapshot, [nodes[1], nodes[0]]), snapshot);
    assert.deepEqual(projectSemanticNodes(snapshot, []), []);
});

test("abandoned semantic projections do not contaminate a sibling render", () => {
    const nodes = [node("a")];
    const snapshot = projectSemanticNodes([], nodes);
    const originalEntry = snapshot[0];
    const abandoned = projectSemanticNodes(snapshot, [node("other")]);
    assert.equal(projectSemanticNodes(snapshot, nodes), snapshot);
    assert.equal(snapshot[0], originalEntry);
    assert.equal(snapshot[0].id, "a");
    assert.equal(abandoned[0].id, "other");
});

test("outgoing handle projection deduplicates, sorts and ignores edge decoration", () => {
    const edges = [edge("one"), edge("two", { sourceHandle: "fatal" }), edge("three")];
    const snapshot = projectOutgoingTransitionHandles(new Map(), edges);
    assert.deepEqual(snapshot.get("a").handles, ["fatal", "success"]);
    const decorated = [...edges].reverse().map((entry) => ({ ...entry, selected: true, animated: true }));
    assert.equal(projectOutgoingTransitionHandles(snapshot, decorated), snapshot);
    assert.equal(snapshot.get("a").signature, "fatal\u001fsuccess");
});

test("outgoing handle projection retains unaffected entries and prunes removed sources", () => {
    const edges = [edge("one"), edge("two", { source: "b", sourceHandle: 0 })];
    const snapshot = projectOutgoingTransitionHandles(new Map(), edges);
    const next = projectOutgoingTransitionHandles(snapshot, [
        edges[0],
        edge("two", { source: "b", sourceHandle: "error" }),
    ]);
    assert.notEqual(next, snapshot);
    assert.equal(next.get("a"), snapshot.get("a"));
    assert.deepEqual(next.get("b").handles, ["error"]);
    assert.deepEqual(snapshot.get("b").handles, ["0"]);
    const removed = projectOutgoingTransitionHandles(next, [edges[0]]);
    assert.equal(removed.has("b"), false);
    assert.equal(next.has("b"), true);
});

test("outgoing handle projection preserves empty-handle semantics and ignores absent handles", () => {
    const snapshot = projectOutgoingTransitionHandles(new Map(), [
        edge("empty", { sourceHandle: "" }),
        edge("missing", { source: "b", sourceHandle: null }),
        edge("no-source", { source: null }),
    ]);
    assert.deepEqual(snapshot.get("a"), { handles: [], signature: "" });
    assert.equal(snapshot.has("b"), false);
    assert.equal(snapshot.size, 1);
});

test("structural edges ignore selection without mutating editor edges", () => {
    const original = edge("selected", { selected: true });
    const snapshot = projectStructureEdges([], [original]);
    assert.equal(snapshot[0].selected, false);
    assert.equal(original.selected, true);
    assert.equal(projectStructureEdges(snapshot, [{ ...original, selected: false }]), snapshot);
    assert.notEqual(projectStructureEdges(snapshot, [{ ...original, sourceHandle: "fatal" }]), snapshot);
    assert.notEqual(projectStructureEdges(snapshot, [{ ...original, data: { controlPoints: [] } }]), snapshot);
    assert.equal(snapshot[0].data, original.data);
});

test("structural edge ordering and removal invalidate the routing input", () => {
    const edges = [edge("one"), edge("two")];
    const snapshot = projectStructureEdges([], edges);
    assert.notEqual(projectStructureEdges(snapshot, [...edges].reverse()), snapshot);
    assert.deepEqual(projectStructureEdges(snapshot, []), []);
    assert.equal(projectStructureEdges(snapshot, edges), snapshot);
});

test("routing snapshots ignore non-geometry metadata, freeze on drag and refresh on drop", () => {
    const nodes = [node("a", { style: { width: 200, height: 80 } })];
    const decorated = [{ ...nodes[0], selected: true, data: { label: "Updated" }, style: { ...nodes[0].style, outline: "2px solid red" } }];
    assert.equal(projectRoutingNodes(nodes, decorated), nodes);
    const moved = [{ ...nodes[0], position: { x: 300, y: 200 } }];
    assert.equal(projectRoutingNodes(nodes, moved, true), nodes);
    assert.equal(projectRoutingNodes(nodes, moved, false), moved);
    assert.deepEqual(nodes[0].position, { x: 10, y: 20 });
    assert.equal(projectRoutingNodes([], moved, true), moved);
});

test("routing snapshots react to collapse, visibility, size, parentage and slot inclusion", () => {
    const nodes = [node("a", { type: "compound", style: { width: 200, height: 80 } })];
    for (const change of [
        { data: { isCollapsed: true } },
        { hidden: true },
        { parentId: "parent" },
        { style: { width: 201, height: 80 } },
        { style: { width: 200, height: 81 } },
        { type: "parallel" },
    ]) {
        assert.notEqual(projectRoutingNodes(nodes, [{ ...nodes[0], ...change }]), nodes);
    }
    const withSlots = [...nodes, node("slot", { type: "slot" })];
    assert.equal(projectRoutingNodes(nodes, withSlots), withSlots);
    assert.equal(projectRoutingNodes(withSlots, nodes), nodes);
});

test("abandoned outgoing, structural and routing projections leave committed snapshots intact", () => {
    const edges = [edge("one"), edge("two", { source: "b" })];
    const handles = projectOutgoingTransitionHandles(new Map(), edges);
    const structure = projectStructureEdges([], edges);
    const nodes = [node("a"), node("b")];
    Object.freeze(structure);
    Object.freeze(nodes);
    const changedEdges = [{ ...edges[0], sourceHandle: "fatal" }];
    const changedNodes = [{ ...nodes[0], position: { x: 400, y: 500 } }];
    const abandonedHandles = projectOutgoingTransitionHandles(handles, changedEdges);
    const abandonedStructure = projectStructureEdges(structure, changedEdges);
    const abandonedRouting = projectRoutingNodes(nodes, changedNodes);
    assert.equal(projectOutgoingTransitionHandles(handles, edges), handles);
    assert.equal(projectStructureEdges(structure, edges), structure);
    assert.equal(projectRoutingNodes(nodes, nodes), nodes);
    assert.equal(handles.get("b").handles[0], "success");
    assert.equal(structure[0], edges[0]);
    assert.equal(nodes[0].position.x, 10);
    assert.deepEqual(abandonedHandles.get("a").handles, ["fatal"]);
    assert.equal(abandonedStructure[0], changedEdges[0]);
    assert.equal(abandonedRouting, changedNodes);
});

function SnapshotProbe({ inputs, project, publish, suspend }) {
    const snapshot = useDerivedGraphSnapshot(inputs, project);
    useLayoutEffect(() => { publish(snapshot); });
    if (suspend) throw suspend;
    return null;
}

function GraphProbe({ inputs, publish, suspend }) {
    const semanticNodes = useSemanticNodeSnapshot(inputs.nodes, inputs.isDraggingNode);
    const presentation = useEditorPresentationGraph({ ...inputs, semanticNodes });
    const display = useEditorDisplay({ ...inputs, ...presentation, semanticNodes });
    useLayoutEffect(() => { publish({ ...presentation, ...display, semanticNodes }); });
    if (suspend) throw suspend;
    return null;
}

test("React graph snapshots preserve identities, policies and bounded interaction work", async (t) => {
    const window = new Window({ url: "http://localhost/" });
    const originals = new Map();
    for (const [name, value] of Object.entries({
        window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const { createRoot } = await import("react-dom/client");
    const container = window.document.createElement("div");
    window.document.body.append(container);
    const root = createRoot(container);
    let latest;
    let key = 0;
    const publish = (value) => { latest = value; };
    const render = async (inputs, options = {}) => {
        const probe = createElement(GraphProbe, { key, inputs, publish, suspend: options.suspend });
        const component = createElement(Suspense, { fallback: "pending" }, probe);
        await act(async () => {
            const next = options.strict ? createElement(StrictMode, null, component) : component;
            if (options.transition) startTransition(() => root.render(next));
            else root.render(next);
        });
        return latest;
    };
    const defaults = {
        nodes: [node("a"), node("b"), node("c"), node("d"), node("unrelated")],
        edges: [edge("ab"), edge("cd", { source: "c", target: "d" })],
        slotNodes: [node("slot-a", { type: "slot" }), node("slot-c", { type: "slot" })],
        slotEdges: [edge("slot-ab", { target: "slot-a", data: { skillNodeId: "a", slotNodeId: "slot-a", access: "read" } }),
            edge("slot-cd", { source: "c", target: "slot-c", data: { skillNodeId: "c", slotNodeId: "slot-c", access: "write" } })],
        selectedNodes: [], selectedNodeId: null, hoveredEditorNodeId: null,
        hoveredEditorEdgeId: null, hoveredSlotAccessNodeId: null,
        tabs: [], activeTabId: "root", activeMode: "overview", showSlotEdges: true,
        isDraggingNode: false, draggingNodeId: null, slotConnectionDrag: null,
        problemNodeIds: new Set(), parallelDropTargetId: null, compoundDropTargetId: null,
        updatePersistentEdgeControlPoints: () => {},
    };

    try {
        await t.test("input guards project once per change, including React's immediate retry", async () => {
            let projections = 0;
            const source = [edge("ab")];
            const project = (previous = new Map()) => {
                projections += 1;
                return projectOutgoingTransitionHandles(previous, source);
            };
            const draw = async (inputs) => act(async () => root.render(createElement(SnapshotProbe, { inputs, project, publish })));
            await draw([source, false]);
            const original = latest;
            assert.equal(projections, 1);
            for (let count = 0; count < 10; count += 1) await draw([source, false]);
            assert.equal(projections, 1);
            await draw([source, true]);
            assert.equal(projections, 2);
            assert.equal(latest, original);
            await draw([source, true]);
            assert.equal(projections, 2);
        });

        await t.test("selection and hover swap only affected variants and publish current callbacks", async () => {
            key += 1;
            const calls = [];
            const before = await render({ ...defaults, handleOpenTransition: (...args) => calls.push([1, ...args]) });
            const after = await render({ ...defaults,
                edges: [{ ...defaults.edges[0], selected: true }, defaults.edges[1]],
                slotEdges: [{ ...defaults.slotEdges[0], selected: true }, defaults.slotEdges[1]],
                handleOpenTransition: (...args) => calls.push([2, ...args]),
                updatePersistentEdgeControlPoints: (...args) => calls.push([3, ...args]),
            });
            assert.equal(after.semanticNodes, before.semanticNodes);
            assert.equal(after.nodeById, before.nodeById);
            assert.equal(after.injectedNodes, before.injectedNodes);
            assert.equal(after.injectedSlotNodes, before.injectedSlotNodes);
            assert.equal(after.smartRoutingNodes, before.smartRoutingNodes);
            assert.equal(after.visibleEdges[1], before.visibleEdges[1]);
            assert.equal(after.visibleEdges[3], before.visibleEdges[3]);
            assert.equal(after.visibleEdges[0].selected, true);
            assert.equal(after.visibleEdges[2].selected, true);
            assert.equal(defaults.edges[0].selected, undefined);
            before.injectedNodes[0].data.onOpenTransition("a", "success");
            before.visibleEdges[0].data.onControlPointsChange([]);
            assert.deepEqual(calls, [[2, "a", "success"], [3, "ab", [], "transition"]]);

            const selected = await render({ ...defaults, selectedNodeId: "c" });
            const hovered = await render({ ...defaults, selectedNodeId: "c", hoveredEditorNodeId: "a" });
            assert.equal(hovered.visibleEdges[1], selected.visibleEdges[1]);
            assert.equal(hovered.visibleEdges[3], selected.visibleEdges[3]);
            assert.equal(hovered.visibleNodes[2].selected, selected.visibleNodes[2].selected);
            assert.equal(hovered.visibleNodes[4], before.visibleNodes[4]);
            assert.match(hovered.visibleNodes[2].className, /editor-node-context-visible/);
            assert.match(hovered.visibleEdges[0].className, /editor-edge-focus-active/);
            assert.match(hovered.visibleEdges[1].className, /editor-edge-selection-related/);
            assert.equal(hovered.visibleEdges[1].selected, undefined);
            const edgeHover = await render({ ...defaults, selectedNodeId: "c", hoveredEditorEdgeId: "ab" });
            assert.equal(edgeHover.visibleNodes[2], hovered.visibleNodes[2]);
            assert.equal(edgeHover.visibleNodes[4], before.visibleNodes[4]);
        });

        await t.test("drag freezes geometry and semantics, reuses untouched nodes, and refreshes on drop", async () => {
            key += 1;
            const inputs = { ...defaults, edges: [defaults.edges[0], { ...defaults.edges[1], selected: true }] };
            const before = await render(inputs);
            const movedNodes = [{ ...inputs.nodes[0], position: { x: 400, y: 500 } }, ...inputs.nodes.slice(1)];
            const dragging = await render({ ...inputs, nodes: movedNodes, isDraggingNode: true, draggingNodeId: "a" });
            assert.equal(dragging.semanticNodes, before.semanticNodes);
            assert.equal(dragging.nodeById, before.nodeById);
            assert.equal(dragging.smartRoutingNodes, before.smartRoutingNodes);
            for (let index = 1; index < inputs.nodes.length; index += 1) {
                assert.equal(dragging.injectedNodes[index], before.injectedNodes[index]);
            }
            assert.deepEqual(dragging.visibleEdges.map(({ id }) => id), ["ab", "cd", "slot-ab"]);
            assert.ok(dragging.visibleEdges.every((entry) => !entry.animated));
            assert.ok(dragging.visibleEdges.every((entry) => entry.data.routingNodes === before.smartRoutingNodes));
            const changed = [{ ...movedNodes[0], position: { x: 600, y: 700 }, data: { label: "Updated" } }, ...movedNodes.slice(1)];
            const nextFrame = await render({ ...inputs, nodes: changed, isDraggingNode: true, draggingNodeId: "a" });
            assert.equal(nextFrame.semanticNodes, before.semanticNodes);
            assert.equal(nextFrame.smartRoutingNodes, before.smartRoutingNodes);
            const dropped = await render({ ...inputs, nodes: changed });
            assert.notEqual(dropped.semanticNodes, before.semanticNodes);
            assert.notEqual(dropped.smartRoutingNodes, before.smartRoutingNodes);
            assert.equal(dropped.nodeById.get("a").data.label, "Updated");
            assert.equal(dropped.smartRoutingNodes[0].position.x, 600);
            assert.deepEqual(before.smartRoutingNodes[0].position, { x: 10, y: 20 });
            assert.equal(dropped.visibleEdges.length, 4);
            const eventMode = await render({ ...inputs, nodes: changed, activeMode: "event" });
            assert.equal(eventMode.visibleNodes.length, inputs.nodes.length);
            assert.ok(eventMode.smartRoutingNodes.every((entry) => entry.type !== "slot"));
            assert.equal(eventMode.visibleEdges.length, 2);
            const codeMode = await render({ ...inputs, nodes: changed, activeMode: "code" });
            assert.deepEqual(codeMode.visibleEdges, []);
            assert.deepEqual(codeMode.smartRoutingNodes, []);
        });

        await t.test("collapse, initial/parallel entry targets, alias focus and drop policies remain intact", async () => {
            key += 1;
            const nodes = [
                node("compound", { type: "compound", data: { initialChildId: "initial" } }),
                node("initial", { parentId: "compound", data: { isInitial: true } }),
                node("parallel", { type: "parallel" }),
                node("lane", { type: "parallelLane", parentId: "parallel" }),
                node("auto", { type: "compound", parentId: "lane", data: { autoParallelLaneCompound: true } }),
                node("leaf", { parentId: "auto" }), node("outside"),
                node("alias", { data: { cloneOfNodeId: "outside", isSkillClone: true } }),
            ];
            const inputs = { ...defaults, nodes, edges: [edge("exit", { source: "leaf", target: "outside" })],
                slotEdges: [edge("slot-exit", { source: "leaf", target: "slot-a" })] };
            const expanded = await render(inputs);
            assert.equal(expanded.visibleEdges.find(({ data }) => data.compoundInitialEdge)?.target, "initial");
            const parallelEntry = expanded.visibleEdges.find(({ data }) => data.parallelEntryEdge);
            assert.equal(parallelEntry.target, "auto");
            assert.equal(parallelEntry.targetHandle, "compound-entry");
            const collapsedNodes = nodes.map((entry) => entry.id === "parallel"
                ? { ...entry, data: { ...entry.data, isCollapsed: true } } : entry);
            const collapsed = await render({ ...inputs, nodes: collapsedNodes });
            assert.deepEqual([...collapsed.hiddenNodeIds].sort(), ["auto", "lane", "leaf"]);
            assert.equal(collapsed.visibleEdges.find(({ id }) => id === "exit").source, "parallel");
            assert.equal(collapsed.visibleEdges.find(({ id }) => id === "exit").sourceHandle, "leaf-success");
            assert.equal(collapsed.visibleEdges.find(({ id }) => id === "slot-exit").sourceHandle, "collapsed-slot-source");
            assert.equal(collapsed.injectedNodes[2].data.collapsedTransitionHandles[0].id, "leaf-success");
            assert.ok(!collapsed.visibleEdges.some(({ data }) => data.parallelEntryEdge));
            assert.ok(collapsed.injectedNodes[5].hidden);
            const focus = await render({ ...inputs, nodes: collapsedNodes, hoveredEditorNodeId: "alias" });
            assert.match(focus.visibleNodes[6].className, /editor-hover-highlight/);
            assert.match(focus.visibleEdges.find(({ id }) => id === "exit").className, /editor-edge-focus-active/);
            const targets = await render({ ...inputs, parallelDropTargetId: "lane", compoundDropTargetId: "compound" });
            for (const id of ["compound", "parallel", "lane"]) {
                assert.equal(targets.visibleNodes.find((entry) => entry.id === id).data.isDropTarget, true);
            }
            assert.equal(targets.visibleNodes[6], expanded.visibleNodes[6]);
            assert.equal(targets.visibleNodes[3].style.outline, "3px solid #0284c7");
        });

        await t.test("slot preview variants reuse inactive objects and keep globally hidden unrelated edges untouched", async () => {
            key += 1;
            const inputs = { ...defaults, selectedNodeId: "slot-a",
                slotEdges: [...defaults.slotEdges, edge("slot-unrelated", { source: "unrelated", target: "slot-c" })] };
            const before = await render(inputs);
            const preview = await render({ ...inputs, hoveredSlotAccessNodeId: "a" });
            const inactive = preview.visibleEdges.find(({ id }) => id === "slot-unrelated");
            assert.equal(inactive.style.opacity, 0.3);
            const another = await render({ ...inputs, hoveredSlotAccessNodeId: "b" });
            assert.equal(another.visibleEdges.find(({ id }) => id === "slot-unrelated"), inactive);
            await render(inputs);
            const repeated = await render({ ...inputs, hoveredSlotAccessNodeId: "a" });
            assert.equal(repeated.visibleEdges.find(({ id }) => id === "slot-unrelated"), inactive);
            const hidden = await render({ ...inputs, hoveredSlotAccessNodeId: "a", showSlotEdges: false });
            assert.equal(hidden.visibleEdges.find(({ id }) => id === "slot-unrelated"), before.visibleEdges.find(({ id }) => id === "slot-unrelated"));
            assert.equal(before.visibleEdges.find(({ id }) => id === "slot-unrelated").style, undefined);
        });

        await t.test("a suspended graph cannot poison the next committed drag or event handlers under StrictMode", async () => {
            key += 1;
            const calls = [];
            const inputs = { ...defaults, handleOpenTransition: () => calls.push("committed") };
            const before = await render(inputs, { strict: true });
            const suspend = new Promise(() => {});
            const pending = { ...inputs, nodes: [{ ...inputs.nodes[0], position: { x: 999, y: 888 } }, ...inputs.nodes.slice(1)],
                slotNodes: [node("pending-slot", { type: "slot" })],
                handleOpenTransition: () => calls.push("abandoned"),
                hoveredEditorNodeId: "a",
            };
            await render(pending, { strict: true, transition: true, suspend });
            assert.equal(latest, before);
            before.injectedNodes[0].data.onOpenTransition();
            assert.deepEqual(calls, ["committed"]);
            const dragging = await render({ ...inputs, isDraggingNode: true, draggingNodeId: "a" }, { strict: true });
            assert.equal(dragging.semanticNodes, before.semanticNodes);
            assert.equal(dragging.semanticSlotNodes, before.semanticSlotNodes);
            assert.equal(dragging.smartRoutingNodes, before.smartRoutingNodes);
            assert.equal(dragging.injectedNodes, before.injectedNodes);
            assert.equal(dragging.injectedSlotNodes, before.injectedSlotNodes);
            assert.equal(dragging.smartRoutingNodes[0].position.x, 10);
        });

        await t.test("840-node/840-edge hover and selection updates do no semantic or outgoing-edge visits", async (t) => {
            key += 1;
            const nodes = Array.from({ length: 840 }, (_, index) => node(`n${index}`));
            const edges = nodes.map((entry, index) => edge(`e${index}`, { source: entry.id, target: nodes[(index + 1) % nodes.length].id }));
            let nodeVisits = 0;
            let edgeVisits = 0;
            nodes.every = (callback) => Array.prototype.every.call(nodes, (...args) => { nodeVisits += 1; return callback(...args); });
            edges.forEach = (callback) => Array.prototype.forEach.call(edges, (...args) => { edgeVisits += 1; return callback(...args); });
            const inputs = { ...defaults, nodes, edges, slotNodes: [], slotEdges: [] };
            const before = await render(inputs);
            nodeVisits = 0;
            edgeVisits = 0;
            for (let count = 0; count < 12; count += 1) {
                const after = await render({ ...inputs,
                    hoveredEditorNodeId: `n${count % 2}`,
                    selectedNodeId: "n420",
                });
                assert.equal(after.nodeById, before.nodeById);
                assert.equal(after.smartRoutingNodes, before.smartRoutingNodes);
                assert.equal(after.injectedNodes, before.injectedNodes);
                assert.equal(after.visibleNodes[800], before.visibleNodes[800]);
                assert.equal(after.visibleEdges[800], before.visibleEdges[800]);
            }
            assert.equal(nodeVisits, 0);
            assert.equal(edgeVisits, 0);
            t.diagnostic("12 hover/selection updates on 840 nodes + 840 edges: 0 semantic-node visits, 0 outgoing-edge visits; unrelated node/edge and routing/hierarchy identities retained");
        });
    } finally {
        await act(async () => root.unmount());
        container.remove();
        await window.happyDOM.abort();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
});

test("consolidated node renderers preserve their public graph and presentation contracts", async (t) => {
    const { createServer } = await import("vite");
    const { default: react } = await import("@vitejs/plugin-react");
    const server = await createServer({
        configFile: false,
        plugins: [react()],
        server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: () => true } },
        optimizeDeps: { noDiscovery: true, include: [] },
        appType: "custom",
    });
    try {
        const states = await server.ssrLoadModule("/src/components/graph/StateNodes.jsx");
        const containers = await server.ssrLoadModule("/src/components/graph/ContainerNodes.jsx");
        const chrome = await server.ssrLoadModule("/src/components/graph/NodeChrome.jsx");
        const render = (component, data = {}, selected = false) => {
            const node = { id: "node", type: "fixture", position: { x: 0, y: 0 }, width: 520, height: 320, data, selected };
            return renderToStaticMarkup(createElement(ReactFlowProvider, { initialNodes: [node] },
                createElement(ReactFlow, { nodes: [node], nodeTypes: { fixture: component }, width: 800, height: 600 })));
        };
        const handles = (html) => [...html.matchAll(/data-handleid="([^"]+)"/g)].map((match) => match[1]);
        const data = {
            label: "Navigate", fullSkillName: "org.skills.Navigate", events: [{ id: "done" }],
            inSlots: [{ key: "input", path: "/input", type: "String" }],
            params: [{ key: "speed", expr: "", default: "1" }],
            localDataModel: [{ id: "#_STATE_PREFIX", expr: "hidden" }, { id: "count", expr: "2" }],
        };

        await t.test("leaf modes share sections but preserve event and editing policies", () => {
            assert.deepEqual(handles(render(states.SkillNode, { ...data, mode: "overview" })), ["transition-target", "done", "fatal", "slot-skill-read-0"]);
            assert.deepEqual(handles(render(states.SkillNode, { ...data, mode: "event" })), ["transition-target", "done", "fatal"]);
            const slots = render(states.SkillNode, { ...data, mode: "slots" });
            assert.deepEqual(handles(slots), ["slot-skill-read-0"]);
            assert.ok(!slots.includes("node-parameter-summary"));
            const child = render(states.SubMachineNode, { ...data, mode: "overview" });
            assert.deepEqual(handles(child), ["transition-target", "done", "slot-skill-read-0"]);
            assert.ok(child.includes("Local Data"));
            assert.ok(!child.includes("#_STATE_PREFIX"));
            assert.ok(!child.includes("click to edit"));
        });

        await t.test("terminals suppress outgoing skill events, not incoming transitions", () => {
            for (const terminal of [{ isFinal: true }, { isBehaviorExit: true }, { fullSkillName: "org.skills.End#instance" }, { fullSkillName: "org.skills.Fatal" }]) {
                assert.deepEqual(handles(render(states.SkillNode, { ...data, ...terminal, mode: "event" })), ["transition-target"]);
            }
            const initial = render(states.SkillNode, { label: "A", isInitial: true, mode: "slots" });
            assert.ok(initial.includes("width:260px;max-width:520px"));
            assert.ok(initial.includes("INITIAL"));
        });

        await t.test("skill instance labels retain falsy-ID fallback and explicit string IDs", () => {
            for (const [editorInstanceId, expected] of [[0, "#fallback"], [false, "#fallback"], [undefined, "#fallback"], ["0", "#0"], ["ref", "#ref"]]) {
                const html = render(states.SkillNode, { label: "Skill", fullSkillName: "org.skills.Skill#fallback", editorInstanceId, mode: "event" });
                assert.ok(html.includes(`>${expected}</span>`));
            }
            assert.doesNotThrow(() => render(states.SkillNode, { label: "Skill", fullSkillName: false }));
        });

        await t.test("references remain target-only in every mode with distinct reconnect behavior", () => {
            for (const mode of ["event", "slots", "overview"]) {
                const skill = render(states.SkillNode, { ...data, mode, isSkillClone: true, editorInstanceId: "ref", reconnectIncomingEdgeId: "edge" });
                const state = render(states.StateReferenceNode, { ...data, mode, sourceNodeType: "compound", reconnectIncomingEdgeId: "edge" });
                assert.deepEqual(handles(skill), ["transition-target"]);
                assert.deepEqual(handles(state), ["transition-target"]);
                assert.ok(skill.includes("Drag to reconnect the incoming transition"));
                assert.ok(!state.includes("Drag to reconnect the incoming transition"));
                assert.ok(skill.includes("border-left-color:#0f766e"));
                assert.ok(state.includes("state-clone-compound"));
            }
        });

        await t.test("runtime parameters keep empty-string values and first normalized-key precedence", () => {
            const html = render(states.SkillNode, {
                ...data, mode: "overview",
                runtimeParameterValues: { " speed ": { value: "", timestamp: "12:00" }, speed: { value: "later" } },
            });
            assert.ok(html.includes("node-parameter-runtime-value"));
            assert.ok(html.includes("&quot;&quot;"));
            assert.ok(html.includes("runtime at 12:00"));
            assert.ok(!html.includes("later"));
        });

        await t.test("container headers share chrome without sharing exit or action policies", () => {
            const container = { label: "Group", mode: "overview", onEntry: [{ location: "count", expr: "1" }], events: [{ id: "choice" }, { id: "exit", target: "next" }] };
            assert.deepEqual(handles(render(containers.CompoundNode, container)), ["transition-target", "compound-entry", "target-exit", "exit"]);
            assert.deepEqual(handles(render(containers.ParallelLaneNode, container)), ["parallel-entry", "target-choice", "choice", "target-exit", "exit"]);
            assert.deepEqual(handles(render(containers.ParallelNode, container)), ["target"]);
            assert.ok(!render(containers.CompoundNode, container).includes("state-action-badges"));
            assert.ok(render(containers.ParallelNode, container).includes("state-action-badges"));
            assert.deepEqual(handles(render(containers.ParallelNode, { ...container, isCollapsed: true, collapsedTransitionHandles: [{ id: "choice" }] })), ["target", "collapsed-slot-source", "exit", "choice"]);
        });

        await t.test("action badges filter incomplete assignments and invoke the current callback", () => {
            const calls = [];
            const actions = { onEntry: [{ location: "count", expr: "1" }, { location: "", expr: "2" }], onExit: [{ location: "count", expr: "" }] };
            for (const version of [1, 2]) {
                const badge = chrome.StateActionBadges({ id: "node", data: { ...actions, onOpenStateActions: (id) => calls.push([version, id]) } });
                const entry = badge.props.children[0];
                const event = { preventDefault: () => calls.push("prevent"), stopPropagation: () => calls.push("stop") };
                entry.props.onClick(event);
                assert.equal(badge.props.children[1], false);
                assert.ok(entry.props.title.startsWith("1 onentry assignment "));
            }
            assert.deepEqual(calls, ["prevent", "stop", [1, "node"], "prevent", "stop", [2, "node"]]);
        });
    } finally {
        await server.close();
    }
});
