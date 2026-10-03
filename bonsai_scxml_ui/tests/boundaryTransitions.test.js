import assert from "node:assert/strict";
import test from "node:test";
import {
    rebuildBoundaryTransitions,
    rebuildBoundaryTransitionsIncremental,
} from "../src/utils/boundaryTransitions.js";

const withIds = (run) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    let nextId = 0;
    Object.defineProperty(globalThis, "crypto", {
        configurable: true, value: { randomUUID: () => `fixture-${++nextId}` },
    });
    try { return run(); } finally {
        if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
        else delete globalThis.crypto;
    }
};

const makeNodes = () => [
    { id: "outer", type: "compound", position: { x: 0, y: 0 }, data: { events: [
        { id: "api", name: "api" },
        { id: "stale", sourceNodeId: "a", transitionHandleId: "success" },
    ] } },
    { id: "parallel", type: "parallel", parentId: "outer", position: { x: 45, y: 90 } },
    { id: "lane", type: "parallelLane", parentId: "parallel", data: { events: [{ id: "stale" }] } },
    { id: "wrapper", type: "compound", parentId: "lane", data: { autoParallelLaneCompound: true } },
    { id: "inner", type: "compound", parentId: "wrapper", data: { isCollapsed: true } },
    { id: "a", type: "custom", parentId: "inner", data: { label: "A" } },
    { id: "b", type: "custom", parentId: "inner", data: { label: "B", isSkillClone: true } },
    { id: "inside", type: "custom", parentId: "wrapper" },
    { id: "outside", type: "custom" },
];

test("nested multisource routes retain helper ordering, managed events and immutable inputs", () => {
    const nodes = makeNodes();
    const edge = { id: "multi", source: "a", target: "outside", sourceHandle: "success", data: {
        boundaryExitId: "joined", boundaryImportedRawEvent: "raw.done",
        boundaryOriginalSources: [
            { sourceId: "a", sourceHandle: "success" },
            { sourceId: "b", sourceHandle: "error" },
        ],
    } };
    const before = structuredClone({ nodes, edge });
    nodes.forEach((node) => { Object.freeze(node.data); Object.freeze(node); });
    Object.freeze(nodes);
    Object.freeze(edge.data);
    Object.freeze(edge);
    const result = withIds(() => rebuildBoundaryTransitions(nodes, [edge]));
    assert.deepEqual(result.edges.map(({ source, target }) => [source, target]), [
        ["a", "inner"], ["inner", "lane"], ["lane", "outer"], ["b", "inner"],
        ["outer", "outside"],
    ]);
    assert.deepEqual(result.edges.slice(0, 4).map(({ data }) => data.boundaryKind),
        ["compound", "parallel", "compound", "compound"]);
    assert.equal(result.edges[4].data.boundaryOriginalSource, "a");
    assert.equal(result.edges[4].data.parallelOriginalSource, "a");
    assert.equal(result.edges[4].sourceHandle, "joined");
    for (const id of ["inner", "lane", "outer"]) {
        const anchor = result.nodes.find((node) => node.id === id);
        const event = anchor.data.events.find(({ id }) => id === "joined");
        assert.equal(event.name, "raw.done");
        assert.deepEqual(event.sourceNodeIds, ["a", "b"]);
        assert.deepEqual(event.transitionHandleIds, ["success", "error"]);
    }
    assert.deepEqual(result.nodes[0].data.events.map(({ id }) => id), ["api", "joined"]);
    assert.equal(result.nodes[3].data.events.length, 0);
    assert.ok(result.nodes[0].style.width >= 320);
    assert.deepEqual({ nodes, edge }, before);
});

test("internal targets, unknown endpoints and self-loop control points retain their behavior", () => {
    const nodes = makeNodes();
    const edges = [
        { id: "inside", source: "a", target: "inside", sourceHandle: "done" },
        { id: "loop", source: "a", target: "a", sourceHandle: "retry" },
        { id: "unknown", source: "missing", target: "outside" },
        { id: "stale-helper", source: "a", target: "inner", data: { compoundInternalEdge: true } },
    ];
    const result = withIds(() => rebuildBoundaryTransitions(nodes, edges));
    assert.deepEqual(result.edges.map(({ source, target }) => [source, target]), [
        ["a", "inner"], ["inner", "inside"], ["a", "a"], ["missing", "outside"],
    ]);
    assert.deepEqual(result.edges[2].data.controlPoints, [
        { id: "cp-fixture-2", anchor: "source", dx: 76, dy: -92 },
        { id: "cp-fixture-3", anchor: "target", dx: -76, dy: -92 },
    ]);
    assert.strictEqual(result.edges[3], edges[2]);
});

test("incremental routing preserves unrelated identities and updates only owned helpers/events", () => {
    const initial = withIds(() => rebuildBoundaryTransitions(makeNodes(), [
        { id: "a-out", source: "a", target: "outside", sourceHandle: "success" },
        { id: "b-out", source: "b", target: "outside", sourceHandle: "error" },
    ]));
    const changedEdges = initial.edges.map((edge) => edge.id === "a-out"
        ? { ...edge, target: "inside" } : edge);
    const result = withIds(() => rebuildBoundaryTransitionsIncremental(initial.nodes, changedEdges, {
        changedEdgeIds: ["a-out"], previousEdges: initial.edges,
    }));
    assert.strictEqual(result.nodes.find(({ id }) => id === "b"), initial.nodes[6]);
    assert.strictEqual(result.edges.find(({ id }) => id === "b-out"),
        initial.edges.find(({ id }) => id === "b-out"));
    assert.equal(result.edges.find(({ id }) => id === "a-out").source, "inner");
    assert.deepEqual(result.affectedNodeIds, ["outer", "lane", "inner"]);
    assert.deepEqual(result.nodes[0].data.events.map(({ id }) => id), ["api", "b-error"]);
    assert.deepEqual(result.nodes[4].data.events.map(({ id }) => id), ["b-error", "a-success"]);
});

test("repeated source/target routes walk each hierarchy once per rebuild", (t) => {
    const depth = 40;
    const nodes = Array.from({ length: depth }, (_, i) => ({
        id: `parent-${i}`, type: "compound", parentId: i ? `parent-${i - 1}` : undefined,
    }));
    nodes.push({ id: "source", type: "custom", parentId: `parent-${depth - 1}` },
        { id: "target", type: "custom" });
    const edges = Array.from({ length: 30 }, (_, i) => ({
        id: `edge-${i}`, source: "source", target: "target", sourceHandle: `event-${i}`,
    }));
    let ancestorVisits = 0;
    const add = Set.prototype.add;
    t.mock.method(Set.prototype, "add", function (value) {
        if (/^parent-\d+$/.test(String(value))) ancestorVisits += 1;
        return add.call(this, value);
    });
    const result = withIds(() => rebuildBoundaryTransitions(nodes, edges));
    assert.equal(result.edges.length, 30 * (depth + 1));
    assert.equal(ancestorVisits, depth);
    withIds(() => rebuildBoundaryTransitions(nodes, edges));
    assert.equal(ancestorVisits, depth * 2);
    t.diagnostic(`30 transitions through 40 boundaries: 40 hierarchy visits per rebuild, not 1200`);
});
