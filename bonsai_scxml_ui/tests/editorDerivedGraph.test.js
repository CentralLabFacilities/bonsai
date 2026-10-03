import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";

import { projectSemanticNodes } from "../src/hooks/useEditorGraphMaintenance.js";
import { projectOutgoingTransitionHandles } from "../src/hooks/useEditorPresentationGraph.js";
import { projectRoutingNodes, projectStructureEdges } from "../src/hooks/useEditorDisplay.js";

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
        const states = await server.ssrLoadModule("/src/components/StateNodes.jsx");
        const containers = await server.ssrLoadModule("/src/components/ContainerNodes.jsx");
        const chrome = await server.ssrLoadModule("/src/components/NodeChrome.jsx");
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
