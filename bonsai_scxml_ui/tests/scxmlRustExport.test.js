import assert from "node:assert/strict";
import test from "node:test";
import { prepareGraphForScxml, prepareNodesForScxml } from "../src/utils/editorScxml.js";
import { rebuildBoundaryTransitions } from "../src/utils/boundaryTransitions.js";
import {
    buildRustEditorExportRequest,
    buildRustEditorNodeSnapshots,
    buildRustEditorStructureSnapshot,
    buildRustParallelLaneMoveContext,
    buildRustSlotsSnapshot,
    buildRustStateParameters,
    buildRustStateEditorPositions,
    getWorkflowDocumentFingerprint,
} from "../src/utils/scxmlRustExport.js";

test("parameter snapshots preserve falsy values and canonical quoted literals without re-escaping", () => {
    const quoted = "'say \\\"hello\\\" and \\\\path'";
    assert.deepEqual(buildRustStateParameters([
        { key: "count", expr: 0, default: "7" },
        { key: "enabled", expr: false, default: "true" },
        { key: "default-zero", expr: "", default: 0 },
        { key: "default-false", expr: "", default: false },
        { key: "quoted", expr: quoted },
        { key: "text", expr: "hello" },
        { key: "reference", expr: "@count" },
        { key: "empty", expr: "", default: "" },
    ]), [
        { key: "count", expression: "0" },
        { key: "enabled", expression: "false" },
        { key: "default-zero", expression: "0" },
        { key: "default-false", expression: "false" },
        { key: "quoted", expression: quoted },
        { key: "text", expression: "'hello'" },
        { key: "reference", expression: "@count" },
    ]);
});

const makeFixture = () => {
    const nodes = [
        { id: "outer", type: "compound", position: { x: 100, y: 200 }, data: { events: [
            { id: "api", name: "api", target: "work-clone", cond: "@ready == true",
                assignments: [{ location: "@count", expr: "" }] },
            { id: "managed", sourceNodeId: "work", transitionHandleId: "success" },
        ] } },
        { id: "parallel", type: "parallel", parentId: "outer", position: { x: 20, y: 40 } },
        { id: "lane", type: "parallelLane", parentId: "parallel", position: { x: 0, y: 60 } },
        { id: "wrapper", type: "compound", parentId: "lane", position: { x: 0, y: 0 },
            data: { autoParallelLaneCompound: true } },
        { id: "inner", type: "compound", parentId: "wrapper", position: { x: 10, y: 15 } },
        { id: "work", type: "custom", parentId: "inner", position: { x: 5, y: 6 }, data: {
            label: "Work", fullSkillName: "pkg.skills.Work#1", isInitial: true,
            params: [{ key: "rate", expr: "@rate" }, { key: "default", default: "4" },
                { key: "empty", expr: "" }],
            onEntry: [{ location: "@count", expr: "@count + 1" }, { location: "empty", expr: "" }],
            onExit: [{ location: "@ready", expr: "TRUE" }],
            inSlots: [{ key: "read", type: "Number", path: "/value", description: "input",
                inherited: { state: "parent", xpath: "/value" } }],
            outSlots: [{ key: "write", type: "Number", path: "/output" }],
        } },
        { id: "work-clone", type: "custom", parentId: "lane", position: { x: 7, y: 8 },
            data: { isSkillClone: true, cloneOfNodeId: "work" } },
        { id: "inner-clone", type: "compound", parentId: "outer", position: { x: 9, y: 10 },
            data: { isStateClone: true, cloneOfNodeId: "inner", sourceNodeType: "compound" } },
        { id: "end-nested", type: "custom", parentId: "inner", position: { x: 2, y: 3 },
            data: { fullSkillName: "pkg.skills.End#nested" } },
        { id: "end-root", type: "custom", position: { x: 800, y: 900 },
            data: { fullSkillName: "pkg.skills.End#root", editorInstanceId: "7" } },
        { id: "end-clone", type: "custom", position: { x: 999, y: 999 },
            data: { isSkillClone: true, cloneOfNodeId: "end-root" } },
        { id: "fatal-first", type: "custom", parentId: "inner",
            data: { fullSkillName: "pkg.skills.Fatal#1" } },
        { id: "fatal-second", type: "custom", parentId: "outer",
            data: { fullSkillName: "pkg.skills.Fatal#2" } },
        { id: "nop-first", type: "custom", data: { fullSkillName: "pkg.skills.Nop#1",
            isBehaviorExit: true, behaviorExitEvents: ["done", "ok"] } },
        { id: "nop-second", type: "custom", parentId: "inner", data: {
            fullSkillName: "pkg.skills.Nop#2", isBehaviorExit: true, behaviorExitEvents: ["ok", "done"],
        } },
        { id: "nop-other", type: "custom", data: { fullSkillName: "pkg.skills.Nop#3",
            isBehaviorExit: true, behaviorExitEvents: ["other"] } },
        { id: "broken-clone", type: "custom", data: { isSkillClone: true, cloneOfNodeId: "missing" } },
        { id: "slot-clone", type: "slot", data: { isSlotClone: true, cloneOfNodeId: "missing" } },
    ];
    const edges = [
        { id: "incoming", source: "outer", target: "work-clone", sourceHandle: "api" },
        { id: "outgoing-clone", source: "work-clone", target: "outer", sourceHandle: "bad" },
        { id: "end-first", source: "work", target: "end-nested", sourceHandle: "done" },
        { id: "end-duplicate", source: "work", target: "end-root", sourceHandle: "done" },
        { id: "boundary", source: "outer", target: "end-root", sourceHandle: "exit", data: {
            boundaryOriginalSource: "work", boundaryOriginalSourceHandle: "success",
            boundaryOriginalSources: [{ sourceId: "work", sourceHandle: "success" },
                { sourceId: "inner", sourceHandle: "done" }],
            assignments: [{ location: "@count", expr: "" }], cond: "@count > 0",
        } },
        { id: "edge-internal-old", source: "work", target: "inner" },
    ];
    return { nodes, edges };
};

test("export preserves canonical ordering, root preference, clone geometry and visual target identity", () => {
    const fixture = makeFixture();
    const before = structuredClone(fixture);
    const preparedGraph = prepareGraphForScxml(fixture.nodes, fixture.edges);
    const structure = buildRustEditorStructureSnapshot({ preparedGraph });
    assert.deepEqual(structure.nodes.map(({ id }) => id), [
        "outer", "parallel", "lane", "wrapper", "inner", "work", "end-root", "fatal-first",
        "nop-first", "nop-other", "broken-clone", "slot-clone",
    ]);
    assert.deepEqual(structure.edges.map(({ id }) => id), ["incoming", "end-first", "boundary"]);
    assert.equal(structure.edges[0].target, "work");
    assert.equal(structure.edges[0].editorTargetInstanceId, "clone-1");
    assert.deepEqual(structure.edges[2].logicalSources,
        [{ stateId: "work", handle: "success" }, { stateId: "inner", handle: "done" }]);
    assert.equal(structure.edges[2].condition, "count > 0");
    assert.deepEqual(structure.edges[2].assignments, [{ location: "count", expression: "" }]);
    assert.deepEqual(structure.nodes[0].events.map(({ id }) => id), ["api"]);
    assert.equal(structure.nodes[0].events[0].target, "work");
    assert.deepEqual(structure.nodes[5].parameters,
        [{ key: "rate", expression: "@rate" }, { key: "default", expression: "4" }]);
    assert.deepEqual(structure.nodes[5].onEntry, [{ location: "count", expression: "'count + 1'" }]);
    assert.deepEqual(structure.nodes[5].onExit, [{ location: "ready", expression: "true" }]);
    assert.equal(structure.nodes[6].fullSkillName, "pkg.skills.End");
    assert.equal(structure.nodes[6].isFinal, true);
    assert.equal(structure.nodes[8].fullSkillName, "pkg.skills.Nop#done");
    assert.deepEqual(buildRustStateEditorPositions({ ...fixture, stateId: "work" }), [
        { instanceId: "original", x: 135, y: 321, cloneType: null },
        { instanceId: "clone-1", x: 127, y: 308, cloneType: "skill" },
    ]);
    assert.deepEqual(buildRustStateEditorPositions({ ...fixture, stateId: "inner" }), [
        { instanceId: "original", x: 130, y: 315, cloneType: null },
        { instanceId: "clone-1", x: 109, y: 210, cloneType: "compound" },
    ]);
    assert.deepEqual(buildRustStateEditorPositions({ ...fixture, stateId: "end-root" }), [
        { instanceId: "1", x: 132, y: 318, cloneType: null },
        { instanceId: "7", x: 800, y: 900, cloneType: null },
    ]);
    assert.deepEqual(fixture, before);
});

test("targeted and explicitly reused prepared snapshots match the full export projection", () => {
    const fixture = makeFixture();
    const preparedGraph = prepareGraphForScxml(fixture.nodes, fixture.edges);
    const structure = buildRustEditorStructureSnapshot(fixture);
    const ids = [" end-root ", "missing", "work", "end-nested", "work", "inner-clone"];
    const expected = [structure.nodes[6], structure.nodes[5], structure.nodes[5]];
    assert.deepEqual(buildRustEditorNodeSnapshots({ ...fixture, stateIds: ids }), expected);
    assert.deepEqual(buildRustEditorNodeSnapshots({ preparedGraph, stateIds: ids }), expected);
    assert.deepEqual(prepareNodesForScxml(fixture.nodes), preparedGraph.nodes);
    for (const state of structure.nodes) {
        assert.deepEqual(buildRustStateEditorPositions({ ...fixture, stateId: state.id }),
            buildRustStateEditorPositions({ preparedGraph, stateId: state.id }));
    }
    assert.deepEqual(buildRustSlotsSnapshot(fixture), buildRustSlotsSnapshot({ preparedGraph }));
    assert.deepEqual(buildRustEditorNodeSnapshots({ stateIds: [] }), []);
    assert.equal(buildRustStateEditorPositions({ ...fixture, stateId: "end-nested" }), null);
    assert.equal(buildRustStateEditorPositions({ stateId: " " }), null);
    const changed = fixture.nodes.map((node) => node.id === "outer"
        ? { ...node, position: { x: 200, y: 300 } } : node);
    assert.equal(buildRustStateEditorPositions({ nodes: changed, stateId: "work" })[0].x, 235);
    assert.equal(buildRustStateEditorPositions({ preparedGraph, stateId: "work" })[0].x, 135);
});

test("clone chains retain per-group position ids independently of visual edge target ids", () => {
    const nodes = [
        { id: "original", type: "custom", position: { x: 10, y: 20 } },
        { id: "clone", type: "custom", position: { x: 30, y: 40 },
            data: { isSkillClone: true, cloneOfNodeId: "original" } },
        { id: "clone-of-clone", type: "custom", position: { x: 50, y: 60 },
            data: { isSkillClone: true, cloneOfNodeId: "clone" } },
    ];
    const edges = [{ id: "incoming", source: "original", target: "clone", sourceHandle: "done" }];
    assert.deepEqual(buildRustStateEditorPositions({ nodes, edges, stateId: "original" }), [
        { instanceId: "original", x: 10, y: 20, cloneType: null },
        { instanceId: "clone-1", x: 30, y: 40, cloneType: "skill" },
    ]);
    assert.equal(buildRustEditorStructureSnapshot({ nodes, edges }).edges[0].editorTargetInstanceId,
        "original");
});

test("duplicate parent ids retain first-match clone coordinates and last-match requested nodes", () => {
    const nodes = [
        { id: "parent", type: "compound", position: { x: 10, y: 20 } },
        { id: "original", type: "custom", parentId: "parent", position: { x: 1, y: 2 } },
        { id: "clone", type: "custom", parentId: "parent", position: { x: 3, y: 4 },
            data: { isSkillClone: true, cloneOfNodeId: "original" } },
        { id: "parent", type: "compound", position: { x: 100, y: 200 } },
    ];
    assert.deepEqual(buildRustStateEditorPositions({ nodes, stateId: "original" }), [
        { instanceId: "original", x: 11, y: 22, cloneType: null },
        { instanceId: "clone-1", x: 13, y: 24, cloneType: "skill" },
    ]);
    assert.equal(buildRustEditorNodeSnapshots({ nodes, stateIds: ["parent"] })[0].x, 100);
    assert.equal(buildRustStateEditorPositions({ nodes, stateId: "parent" })[0].x, 10);
});

test("slots, lane membership, empty positions and export declarations retain their payloads", () => {
    const fixture = makeFixture();
    const manualSlots = [{ key: "extra", state: "outer", path: "/extra" },
        { key: "inherit", slotKind: "inheritSlot", inherited: { state: "parent", xpath: "/in" } }];
    const slots = buildRustSlotsSnapshot({ ...fixture, manualSlots });
    assert.deepEqual(slots.states.find(({ stateId }) => stateId === "work").inputSlots, [{
        key: "read", typeName: "Number", description: "input", path: "/value",
        inheritedState: "parent", inheritedXpath: "/value", inherited: true,
    }]);
    assert.deepEqual(slots.extraSlotDeclarations, [
        { key: "extra", state: "outer", xpath: "/extra", inherited: false },
        { key: "inherit", state: "parent", xpath: "/in", inherited: true },
    ]);
    assert.deepEqual(buildRustParallelLaneMoveContext({ ...fixture, laneId: "lane" }).memberStateIds,
        ["inner"]);
    assert.deepEqual(buildRustStateEditorPositions({ nodes: [{ id: "empty", type: "custom" }],
        stateId: "empty" }), [{ x: 0, y: 0, instanceId: null, cloneType: null }]);
    const request = buildRustEditorExportRequest({ ...fixture, manualSlots,
        globalDataModel: [{ id: "ready", expr: "TRUE" }] });
    assert.deepEqual(request.extraSlotDeclarations, slots.extraSlotDeclarations);
    assert.deepEqual(request.dataModel, [{ id: "ready", expression: "true" }]);
});

test("single-state/position payloads skip unrelated actions, clone geometry and every edge", (t) => {
    let actionReads = 0;
    let positionReads = 0;
    let parameterReads = 0;
    const visitedEdges = new Set();
    const nodes = [];
    for (let i = 0; i < 200; i += 1) {
        nodes.push({ id: `state-${i}`, type: "custom", position: {
            get x() { positionReads += 1; return i; }, y: 10,
        }, data: { fullSkillName: "pkg.skills.Work", onEntry: [{ location: "value",
            get expr() { actionReads += 1; return "@value"; },
        }], params: [{ key: "parameter", get expr() { parameterReads += 1; return "3"; } }] } },
        { id: `clone-${i}`, type: "custom", position: {
            get x() { positionReads += 1; return i + 1; }, y: 20,
        }, data: { isSkillClone: true, cloneOfNodeId: `state-${i}` } });
    }
    const edges = Array.from({ length: 800 }, (_, i) => ({ id: `edge-${i}`, source: "state-0",
        target: `state-${i % 200}`, get data() { visitedEdges.add(i); return {}; },
    }));
    prepareGraphForScxml(nodes, edges);
    assert.deepEqual([actionReads, positionReads, visitedEdges.size], [400, 400, 800]);
    actionReads = positionReads = parameterReads = 0;
    visitedEdges.clear();
    buildRustEditorNodeSnapshots({ nodes, edges, stateIds: ["state-0"] });
    assert.deepEqual([actionReads, positionReads, visitedEdges.size], [2, 3, 0]);
    actionReads = positionReads = parameterReads = 0;
    buildRustStateEditorPositions({ nodes, edges, stateId: "state-0" });
    assert.deepEqual([actionReads, positionReads, parameterReads, visitedEdges.size], [0, 2, 0, 0]);
    buildRustSlotsSnapshot({ nodes, edges });
    assert.equal(parameterReads, 0);
    assert.equal(visitedEdges.size, 0);
    t.diagnostic("400 nodes/800 edges: selected action reads 400 -> 2; clone x reads 400 -> 2; edge visits 800 -> 0");
});

test("document fingerprints are deterministic across equivalent decorated and selected snapshots", () => {
    const document = { ...makeFixture(), globalDataModel: [{ id: "ready", expr: "TRUE" }],
        manualSlots: [{ key: "extra", state: "outer", path: "/extra" }] };
    const decorated = structuredClone(document);
    const callback = () => { throw new Error("Fingerprint must not execute UI callbacks"); };
    decorated.nodes = decorated.nodes.map((node) => ({
        selected: true, dragging: true, hidden: true, measured: { width: 900, height: 700 },
        width: 900, height: 700, style: { color: "red", width: 900, height: 700 },
        className: "runtime-active", positionAbsolute: { x: 999, y: 999 },
        ...node,
        data: { ...(node.data || {}), onSelect: callback, onUpdate: callback,
            runtimeState: "active", runtimeParams: { ready: false }, mode: "runtime",
            localDataModel: [{ id: "derived", expr: "changed" }],
            isCollapsed: true, expandedContainerSize: { width: 1200, height: 800 } },
    }));
    decorated.edges = decorated.edges.map((edge) => ({
        ...edge, selected: true, animated: true, type: "smartTransition", targetHandle: "ui-port",
        style: { stroke: "red" }, markerEnd: { type: "arrow" },
        data: { ...(edge.data || {}), onDelete: callback, runtimeState: "active",
            controlPoints: [{ id: "random-route-id", anchor: "source", dx: 100, dy: 200 }] },
    }));
    Object.assign(decorated, { viewport: { x: 300, y: 400, zoom: 2 }, title: "Other title",
        filePath: "/different/path", inheritedGlobalDataModel: [{ id: "derived", expr: "4" }],
        slotNodes: [{ id: "derived-slot", position: { x: 80, y: 90 }, data: { path: "/other" } }],
        slotEdges: [{ id: "derived-edge", source: "derived-slot", target: "work" }] });
    decorated.nodes[0].data.runtimeSnapshot = decorated;
    const fingerprint = getWorkflowDocumentFingerprint(document);
    assert.equal(typeof fingerprint, "string");
    assert.deepEqual(getWorkflowDocumentFingerprint(), getWorkflowDocumentFingerprint({
        nodes: [], edges: [], globalDataModel: [], manualSlots: [],
    }));
    assert.equal(fingerprint, getWorkflowDocumentFingerprint(document));
    assert.equal(fingerprint, getWorkflowDocumentFingerprint(decorated));
    assert.deepEqual(JSON.parse(fingerprint).dataModel, [{ id: "ready", expression: "true" }]);
});

test("document fingerprints detect saveable content, node/reference geometry and logical/visual edge edits", () => {
    const document = { ...makeFixture(), globalDataModel: [{ id: "ready", expr: "true" }],
        manualSlots: [{ key: "extra", state: "outer", path: "/extra" }] };
    const fingerprint = getWorkflowDocumentFingerprint(document);
    const changes = [
        ["state label", (d) => { d.nodes[0].data.label = "Renamed outer"; }],
        ["skill identity", (d) => { d.nodes[5].data.fullSkillName = "pkg.skills.Other#1"; }],
        ["submachine source", (d) => { d.nodes[5].data.src = "other.scxml"; }],
        ["initial state", (d) => { d.nodes[5].data.isInitial = false; }],
        ["final state", (d) => { d.nodes[5].data.isFinal = true; }],
        ["initial child", (d) => { d.nodes[4].data = { initialChildId: "work" }; }],
        ["initial substate", (d) => { d.nodes[5].data.initialSubState = "Other"; }],
        ["parameter expression", (d) => { d.nodes[5].data.params[0].expr = "42"; }],
        ["parameter default", (d) => { d.nodes[5].data.params[1].default = "5"; }],
        ["entry assignment", (d) => { d.nodes[5].data.onEntry[0].expr = "2"; }],
        ["exit assignment", (d) => { d.nodes[5].data.onExit[0].location = "other"; }],
        ["bound event", (d) => { d.nodes[5].data.events = [{ id: "retry", target: "outer" }]; }],
        ["output slot binding", (d) => { d.nodes[5].data.outSlots[0].path = "/changed"; }],
        ["input slot key", (d) => { d.nodes[5].data.inSlots[0].key = "other"; }],
        ["inherited slot state", (d) => { d.nodes[5].data.inSlots[0].inherited.state = "other"; }],
        ["inherited slot xpath", (d) => { d.nodes[5].data.inSlots[0].inherited.xpath = "/other"; }],
        ["slot inheritance", (d) => { delete d.nodes[5].data.inSlots[0].inherited; }],
        ["global expression", (d) => { d.globalDataModel[0].expr = "false"; }],
        ["manual slot", (d) => { d.manualSlots[0].path = "/changed"; }],
        ["behavior exit", (d) => { d.nodes[13].data.behaviorExitEvents = ["changed"]; }],
        ["state position", (d) => { d.nodes[5].position.x += 1; }],
        ["ancestor position", (d) => { d.nodes[0].position.y += 1; }],
        ["lane ancestor position", (d) => { d.nodes[2].position.y += 1; }],
        ["skill reference position", (d) => { d.nodes[6].position.x += 1; }],
        ["state reference position", (d) => { d.nodes[7].position.y += 1; }],
        ["reference identity", (d) => { d.nodes[6].data.cloneOfNodeId = "end-root"; }],
        ["visual instance identity", (d) => { d.nodes[6].data.editorInstanceId = "reference-2"; }],
        ["reference kind", (d) => { d.nodes[7].data.sourceNodeType = "parallel"; }],
        ["state containment", (d) => { d.nodes[5].parentId = "outer"; }],
        ["edge source", (d) => { d.edges[0].source = "work"; }],
        ["edge semantic target", (d) => { d.edges[0].target = "outer"; }],
        ["edge visual target", (d) => { d.edges[0].target = "work"; }],
        ["edge event", (d) => { d.edges[0].sourceHandle = "retry"; }],
        ["edge condition", (d) => { d.edges[4].data.cond = "@count > 1"; }],
        ["edge assignment", (d) => { d.edges[4].data.assignments[0].expr = "3"; }],
        ["logical edge source", (d) => { d.edges[4].data.boundaryOriginalSources[1].sourceId = "outer"; }],
        ["logical edge handle", (d) => { d.edges[4].data.boundaryOriginalSources[1].sourceHandle = "retry"; }],
        ["imported boundary event", (d) => { d.edges[4].data.boundaryImportedRawEvent = "Work.retry"; }],
        ["state insertion", (d) => { d.nodes.push({ id: "new", type: "custom" }); }],
        ["edge removal", (d) => { d.edges.splice(0, 1); }],
    ];
    for (const [label, change] of changes) {
        const edited = structuredClone(document);
        change(edited);
        assert.notEqual(getWorkflowDocumentFingerprint(edited), fingerprint, label);
    }
});

test("document fingerprints retain persisted state, transition, parameter and declaration ordering", () => {
    const document = { ...makeFixture(),
        globalDataModel: [{ id: "first", expr: "1" }, { id: "second", expr: "2" }],
        manualSlots: [{ key: "first", state: "work", path: "/first" },
            { key: "second", state: "work", path: "/second" }] };
    document.edges.push({ id: "retry", source: "work", target: "end-root", sourceHandle: "retry" });
    document.nodes[0].data.containerTransitionOrder = ["boundary", "retry"];
    const fingerprint = getWorkflowDocumentFingerprint(document);
    const changes = [
        ["states", (d) => { [d.nodes[9], d.nodes[13]] = [d.nodes[13], d.nodes[9]]; }],
        ["transitions", (d) => { d.edges.reverse(); }],
        ["parameters", (d) => { d.nodes[5].data.params.reverse(); }],
        ["container transitions", (d) => { d.nodes[0].data.containerTransitionOrder.reverse(); }],
        ["datamodel", (d) => { d.globalDataModel.reverse(); }],
        ["manual declarations", (d) => { d.manualSlots.reverse(); }],
    ];
    for (const [label, change] of changes) {
        const reordered = structuredClone(document);
        change(reordered);
        assert.notEqual(getWorkflowDocumentFingerprint(reordered), fingerprint, label);
    }
});

test("document fingerprints normalize API-only declarations, defaults and actual inherited slot bindings", () => {
    const document = { nodes: [{ id: "work", type: "custom", data: {
        fullSkillName: "pkg.skills.Work", params: [{ key: "rate", default: "4" }],
        events: [{ id: "api", name: "unused", cond: "@ready", assignments: [] }],
        inSlots: [{ key: "unbound", type: "Number", description: "API slot" },
            { key: "read", path: " value ", inherited: {} }],
        outSlots: [{ key: "write", path: " output ", type: "Number", description: "output" }],
    } }], edges: [], globalDataModel: [{ id: "ready", expr: " TRUE " }],
    manualSlots: [{ key: " extra ", state: " parent ", path: " extra " }] };
    const hydrated = structuredClone(document);
    hydrated.nodes[0].data.params = [{ key: "rate", expr: "4", default: "9", type: "Number" },
        { key: "empty", expr: "", description: "API parameter" }];
    hydrated.nodes[0].data.events = [{ id: "different-api", name: "other", target: "  " }];
    hydrated.nodes[0].data.inSlots = [
        { key: "read", path: "/ignored-binding", type: "String", description: "Updated API",
            inherited: { state: "pkg.skills.Work", xpath: " /value " } },
        { key: "another-unbound", path: " ", inherited: { state: "parent", xpath: "/unused" } },
    ];
    hydrated.nodes[0].data.outSlots[0] = { key: " write ", path: "/output", type: "String" };
    hydrated.globalDataModel[0].expr = "true";
    hydrated.manualSlots = [{ key: "extra", state: "parent", path: "/extra", type: "String" },
        { key: "unbound", state: "parent", path: " " }];
    const fingerprint = getWorkflowDocumentFingerprint(document);
    assert.equal(getWorkflowDocumentFingerprint(hydrated), fingerprint);
    assert.deepEqual(JSON.parse(fingerprint).nodes[0].inputSlots, [{
        key: "read", state: "pkg.skills.Work", xpath: "/value", inherited: true,
    }]);
    assert.deepEqual(JSON.parse(fingerprint).nodes[0].events, []);
    const bound = structuredClone(document);
    bound.nodes[0].data.events[0].target = "work";
    const boundFingerprint = getWorkflowDocumentFingerprint(bound);
    assert.notEqual(boundFingerprint, fingerprint);
    for (const [key, value] of [["name", "changed"], ["cond", "@ready == false"],
        ["assignments", [{ location: "ready", expr: "false" }]], ["target", "other"]]) {
        const changed = structuredClone(bound);
        changed.nodes[0].data.events[0][key] = value;
        assert.notEqual(getWorkflowDocumentFingerprint(changed), boundFingerprint, key);
    }
    const inherited = structuredClone(document);
    inherited.manualSlots[0] = { key: "extra", slotKind: "inheritSlot",
        inherited: { state: "parent", xpath: "/extra" } };
    assert.notEqual(getWorkflowDocumentFingerprint(inherited), fingerprint);
});

test("document fingerprints include normal path-only resources without weakening binding filters", () => {
    const empty = getWorkflowDocumentFingerprint();
    const resources = [
        { path: " needed " }, { key: " Key ", path: " /key-only " },
        { state: " Owner ", path: "/state-only" }, { path: "/" },
        { key: "bound", state: "Owner", path: "/bound" },
        { key: "inherited", slotKind: "inheritSlot", inherited: { state: "Parent", xpath: " outer " } },
        { key: "ignored", state: "Owner", path: " " },
        { slotKind: "inheritSlot", inherited: { state: "Parent", xpath: "/incomplete" } },
    ];
    const fingerprint = getWorkflowDocumentFingerprint({ manualSlots: resources });
    assert.notEqual(fingerprint, empty);
    assert.deepEqual(JSON.parse(fingerprint).extraSlotDeclarations, [
        { key: "", state: "", xpath: "/needed", inherited: false },
        { key: "Key", state: "", xpath: "/key-only", inherited: false },
        { key: "", state: "Owner", xpath: "/state-only", inherited: false },
        { key: "", state: "", xpath: "/", inherited: false },
        { key: "bound", state: "Owner", xpath: "/bound", inherited: false },
        { key: "inherited", state: "Parent", xpath: "/outer", inherited: true },
    ]);
    const normalized = resources.map((slot) => ({ ...slot, type: "String", id: "visual",
        createdForChildRequirements: ["child"], position: { x: 900, y: 800 } }));
    normalized[0].path = "/needed";
    assert.equal(getWorkflowDocumentFingerprint({ manualSlots: normalized }), fingerprint);
    for (const change of [
        (slots) => { slots[0].path = "/renamed"; },
        (slots) => { slots.splice(0, 1); },
        (slots) => { slots.push({ path: "/new" }); },
        (slots) => { [slots[0], slots[1]] = [slots[1], slots[0]]; },
    ]) {
        const edited = structuredClone(resources);
        change(edited);
        assert.notEqual(getWorkflowDocumentFingerprint({ manualSlots: edited }), fingerprint);
    }
    assert.deepEqual(JSON.parse(getWorkflowDocumentFingerprint({ nodes: [{ id: "node", type: "custom",
        data: { inSlots: [{ path: "/unbound" }], outSlots: [{ key: "", path: "/unbound" }] },
    }] })).nodes[0].inputSlots, []);
});

test("document fingerprints ignore regenerated boundary helpers and managed border events", () => {
    const nodes = [
        { id: "outer", type: "compound", position: { x: 10, y: 20 }, data: { events: [] } },
        { id: "work", type: "custom", parentId: "outer", position: { x: 5, y: 6 } },
        { id: "outside", type: "custom", position: { x: 500, y: 600 } },
    ];
    const edges = [{ id: "leave", source: "work", target: "outside", sourceHandle: "success" }];
    const first = rebuildBoundaryTransitions(nodes, edges);
    const second = rebuildBoundaryTransitions(first.nodes, first.edges);
    assert.notEqual(first.edges[0].id, second.edges[0].id);
    assert.equal(first.edges[0].data.boundaryInternalEdge, true);
    assert.equal(getWorkflowDocumentFingerprint(first), getWorkflowDocumentFingerprint(second));
    const decorated = structuredClone(second);
    decorated.edges[0].data.cond = "changed-helper";
    decorated.nodes[0].data.events[0].id = "regenerated-border-handle";
    decorated.nodes[0].data.events[0].name = "derived-label";
    assert.equal(getWorkflowDocumentFingerprint(first), getWorkflowDocumentFingerprint(decorated));
});

test("document fingerprint checkpoints are pure, immutable and detached from subsequent document edits", () => {
    const document = { ...makeFixture(), globalDataModel: [{ id: "ready", expr: "TRUE" }],
        manualSlots: [{ key: "extra", state: "outer", path: "/extra" }] };
    const before = structuredClone(document);
    const freeze = (value) => {
        if (!value || typeof value !== "object") return;
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    };
    freeze(document);
    const checkpoint = getWorkflowDocumentFingerprint(document);
    assert.deepEqual(document, before);
    assert.equal(checkpoint, getWorkflowDocumentFingerprint(before));
    before.nodes[5].data.params[0].expr = "99";
    const newer = getWorkflowDocumentFingerprint(before);
    assert.notEqual(newer, checkpoint);
    assert.equal(checkpoint, getWorkflowDocumentFingerprint(document));
    before.nodes[5].data.params[0].expr = "@rate";
    assert.equal(getWorkflowDocumentFingerprint(before), checkpoint);
});
