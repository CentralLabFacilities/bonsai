import assert from "node:assert/strict";
import test from "node:test";
import { prepareGraphForScxml, prepareNodesForScxml } from "../src/utils/editorScxml.js";
import {
    buildRustEditorExportRequest,
    buildRustEditorNodeSnapshots,
    buildRustEditorStructureSnapshot,
    buildRustParallelLaneMoveContext,
    buildRustSlotsSnapshot,
    buildRustStateEditorPositions,
} from "../src/utils/scxmlRustExport.js";

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
