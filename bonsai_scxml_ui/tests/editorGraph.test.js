import assert from "node:assert/strict";
import test from "node:test";
import { createEditorNodeIndex } from "../src/utils/editorGraph.js";
import { estimateSlotDockWidth, estimateSummaryWidth, getOverviewLayoutNodeSize } from "../src/utils/layoutUtils.js";
import { getSlotHandleDragClass, getStateSlotEntries } from "../src/utils/slotVisuals.js";
import {
    canTargetAcrossStateBoundaries,
    findDropContainerAtPoint,
    getAbsoluteNodePosition,
    getEnclosingStateContainers,
    getNodeNestingDepth,
    isNodeInsideContainer,
    orderNodesParentsFirst,
} from "../src/utils/editorGeometry.js";

const node = (id, type = "compound", parentId, x = 0, y = 0) => ({
    id, type, parentId, position: { x, y }, width: 500, height: 500,
});

test("snapshot indexes preserve child/ancestor order, missing parents and cycles", () => {
    const nodes = [
        node("leaf", "custom", "lane", 3, 4),
        node("outer", "compound", undefined, 100, 200),
        node("parallel", "parallel", "outer", 20, 30),
        node("lane", "parallelLane", "parallel", 0, 50),
        node("sibling", "custom", "lane"),
        node("orphan", "custom", "missing", 7, 8),
        node("cycle-a", "compound", "cycle-b", 2, 3),
        node("cycle-b", "compound", "cycle-a", 5, 7),
    ];
    nodes.forEach((entry) => { Object.freeze(entry.position); Object.freeze(entry); });
    Object.freeze(nodes);
    const index = createEditorNodeIndex(nodes);
    assert.deepEqual(index.getChildren("lane").map(({ id }) => id), ["leaf", "sibling"]);
    assert.deepEqual([...index.getAncestorIds("leaf")], ["lane", "parallel", "outer"]);
    assert.deepEqual(index.getAbsolutePosition("leaf"), { x: 123, y: 284 });
    assert.strictEqual(index.getAbsolutePosition("leaf"), index.getAbsolutePosition("leaf"));
    assert.equal(index.findAncestor("leaf", ({ type }) => type === "parallel").id, "parallel");
    assert.equal(index.getNestingDepth("leaf"), 3);
    assert.equal(index.getNestingDepth("orphan"), 0);
    assert.deepEqual([...index.getAncestorIds("orphan")], ["missing"]);
    assert.equal(isNodeInsideContainer(nodes[5], "missing", nodes, index), true);
    assert.deepEqual([...index.getAncestorIds("cycle-a")], ["cycle-b", "cycle-a"]);
    assert.equal(index.getNestingDepth("cycle-a"), 2);
    assert.deepEqual(index.getAbsolutePosition("cycle-a"), { x: 9, y: 13 });
    assert.deepEqual(index.getAbsolutePosition("unknown"), { x: 0, y: 0 });
    assert.deepEqual(orderNodesParentsFirst(nodes).map(({ id }) => id), [
        "outer", "orphan", "parallel", "lane", "cycle-a", "cycle-b", "leaf", "sibling",
    ]);
});

test("geometry index reuse preserves boundary checks and legacy coordinate addition", () => {
    const nodes = [node("outer"), node("inner", "compound", "outer", 4, 6),
        node("a", "custom", "inner", "2", 3), node("b", "custom", "inner"),
        node("outside", "custom")];
    const index = createEditorNodeIndex(nodes);
    assert.deepEqual(getAbsoluteNodePosition(nodes[2], nodes, index),
        getAbsoluteNodePosition(nodes[2], nodes));
    assert.equal(getAbsoluteNodePosition(nodes[2], nodes, index).x, "240");
    assert.deepEqual(getEnclosingStateContainers(nodes[2], nodes, index).map(({ id }) => id),
        ["inner", "outer"]);
    assert.equal(getNodeNestingDepth(nodes[2], nodes, index), 2);
    assert.equal(canTargetAcrossStateBoundaries(nodes[3], nodes[2], nodes, index), true);
    assert.equal(canTargetAcrossStateBoundaries(nodes[4], nodes[2], nodes, index), false);
    assert.equal(canTargetAcrossStateBoundaries(nodes[0], nodes[2], nodes, index), false);
    assert.equal(canTargetAcrossStateBoundaries(null, nodes[0], nodes, index), true);
    assert.equal(isNodeInsideContainer({ parentId: "inner" }, "outer", nodes, index), true);
    const changed = nodes.map((entry) => entry.id === "inner"
        ? { ...entry, position: { x: 40, y: 60 } } : entry);
    assert.deepEqual(createEditorNodeIndex(changed).getAbsolutePosition("b"), { x: 40, y: 60 });
    assert.deepEqual(index.getAbsolutePosition("b"), { x: 4, y: 6 });
});

test("drop targets retain deepest, compound-preferred, later-rendered and lane-wrapper rules", () => {
    const nodes = [node("outer"), node("lane", "parallelLane", "outer", 10, 10),
        { ...node("wrapper", "compound", "lane"), data: { autoParallelLaneCompound: true } },
        node("inner-a", "compound", "wrapper", 10, 10),
        node("inner-b", "compound", "wrapper", 10, 10),
        node("same-depth-lane", "parallelLane", "wrapper", 10, 10)];
    const point = { x: 25, y: 25 };
    assert.equal(findDropContainerAtPoint(point, nodes).id, "inner-b");
    assert.equal(findDropContainerAtPoint(point, nodes, { excludeNodeId: "wrapper" }).id, "lane");
    assert.equal(findDropContainerAtPoint(point, nodes, { allowCompounds: false }).id,
        "same-depth-lane");
    assert.equal(findDropContainerAtPoint(point, nodes.slice(0, 3)).id, "lane");
    assert.equal(findDropContainerAtPoint({ x: 1000, y: 1000 }, nodes), null);
    assert.equal(findDropContainerAtPoint(null, nodes), null);
    assert.strictEqual(findDropContainerAtPoint(point, nodes, {
        graphIndex: createEditorNodeIndex(nodes),
    }), nodes[4]);
});

test("malformed duplicate ids preserve first-match geometry and last-match hierarchy semantics", () => {
    const nodes = [node("left", "compound", undefined, 10, 20), node("right"),
        node("duplicate", "custom", "left", 1, 2),
        node("duplicate", "custom", "right", 3, 4),
        node("left", "compound", "right", 100, 200)];
    const index = createEditorNodeIndex(nodes);
    assert.equal(index.hasDuplicateIds, true);
    assert.deepEqual(getAbsoluteNodePosition(nodes[2], nodes, index), { x: 11, y: 22 });
    assert.equal(getNodeNestingDepth(nodes[2], nodes, index), 2);
    assert.equal(isNodeInsideContainer(nodes[2], "left", nodes, index), true);
    assert.equal(isNodeInsideContainer(nodes[3], "left", nodes, index), false);
});

test("synthetic hit-testing scans the node array twice, never per candidate", (t) => {
    const nodes = [];
    for (let branch = 0; branch < 120; branch += 1) {
        for (let depth = 0; depth < 7; depth += 1) {
            nodes.push(node(`${branch}-${depth}`, "compound",
                depth ? `${branch}-${depth - 1}` : undefined, 1, 1));
        }
    }
    let visits = 0;
    const forEach = nodes.forEach;
    nodes.forEach = (callback) => forEach.call(nodes, (entry, index) => {
        visits += 1;
        callback(entry, index);
    });
    nodes.find = () => { assert.fail("hierarchy lookup must not scan nodes"); };
    nodes.map = () => { assert.fail("hierarchy lookup must not rebuild per-node maps"); };
    assert.equal(findDropContainerAtPoint({ x: 20, y: 20 }, nodes, {
        excludeNodeId: "unrelated",
    }).id, "119-6");
    assert.equal(visits, nodes.length * 2);
    t.diagnostic(`840-node hit-test: ${visits} array visits; no array.find/map hierarchy scans`);
});

test("shared slot preparation preserves source indices and family-specific inheritance", () => {
    const data = {
        inSlots: [
            { key: "", path: "/fallback", inherited: true },
            { key: "input", path: "", inherited: true },
            { key: "other", inherited: { xpath: "/parent" } },
        ],
        outSlots: [{ key: "output", path: "/output", type: "String" }],
        inheritedSlots: [
            { key: "invalid", access: "both" },
            { key: "parent", access: "read" },
            { path: "/child", access: "write" },
        ],
    };
    const original = structuredClone(data);
    const skill = getStateSlotEntries(data, "custom");
    assert.deepEqual(skill.map(({ handleId, inherited }) => [handleId, inherited]), [
        ["slot-skill-read-1", false], ["slot-skill-read-2", true], ["slot-skill-write-0", false],
    ]);
    const submachine = getStateSlotEntries(data, "submachine");
    assert.deepEqual(submachine.map(({ handleId, inherited }) => [handleId, inherited]), [
        ["slot-skill-read-0", true], ["slot-skill-read-1", true], ["slot-skill-read-2", true],
        ["slot-skill-write-0", false], ["slot-submachine-read-1", true], ["slot-submachine-write-2", true],
    ]);
    skill[0].key = "changed";
    assert.deepEqual(data, original);
    assert.deepEqual(getStateSlotEntries(), []);
});

test("shared slot drag policy retains access, type, origin and active-handle rules", () => {
    const endpoint = { nodeId: "node", handleId: "handle", access: "read", slotType: " Pose " };
    const drag = { active: true, nodeId: "other", handleId: "other", origin: "slot", access: "read", slotType: "pose" };
    const classify = (origin, changes = {}) => getSlotHandleDragClass({ ...endpoint, origin, drag: { ...drag, ...changes } });
    assert.equal(getSlotHandleDragClass(endpoint), "");
    assert.equal(classify("skill", { active: false }), "");
    assert.equal(classify("skill"), "slot-handle-compatible");
    assert.equal(classify("skill", { origin: "skill" }), "slot-handle-incompatible");
    assert.equal(classify("skill", { access: "write" }), "slot-handle-incompatible");
    assert.equal(classify("skill", { slotType: "string" }), "slot-handle-incompatible");
    assert.equal(classify("skill", { slotType: "" }), "slot-handle-incompatible");
    assert.equal(classify("slot", { origin: "skill" }), "slot-handle-compatible");
    assert.equal(classify("slot"), "slot-handle-incompatible");
    // Submachine policy intentionally differs from both skill and data-slot ports.
    assert.equal(classify("submachine", { origin: "skill" }), "slot-handle-compatible");
    assert.equal(classify("submachine", { origin: "submachine" }), "slot-handle-incompatible");
    assert.equal(classify("slot", { origin: "submachine" }), "slot-handle-incompatible");
    assert.equal(classify("slot", { nodeId: "node", handleId: "handle", access: "write", slotType: "" }), "slot-handle-compatible slot-handle-active");
});

test("shared width primitives retain horizontal labels, compact docks and bounded summaries", () => {
    assert.equal(estimateSlotDockWidth([]), 0);
    assert.equal(estimateSlotDockWidth([{ key: "x" }]), 180);
    assert.equal(estimateSlotDockWidth([{ key: "abcdefghij" }, { key: "abcdefghij" }]), 206);
    assert.equal(estimateSlotDockWidth([{ key: "x".repeat(100) }, { path: "y".repeat(100) }]), 236);
    assert.equal(estimateSlotDockWidth(Array.from({ length: 3 }, () => ({ key: "long" }))), 180);
    assert.equal(estimateSlotDockWidth(Array.from({ length: 8 }, () => ({ key: "long" }))), 240);
    assert.equal(estimateSlotDockWidth(Array.from({ length: 30 }, () => ({ key: "long" }))), 520);
    assert.equal(estimateSummaryWidth("long label", []), 0);
    assert.equal(estimateSummaryWidth("", ["x = 1"]), 190);
    assert.equal(estimateSummaryWidth("x".repeat(40), ["y"]), 335);
    assert.equal(estimateSummaryWidth("", ["x".repeat(100)]), 520);
});

test("overview layout retains its distinct sizing policy and explicit container geometry", () => {
    assert.deepEqual(getOverviewLayoutNodeSize({ type: "custom", data: {} }), { width: 210, height: 80 });
    const skill = { type: "custom", data: { label: "Skill", params: [{ key: "x", expr: "", default: "v".repeat(80) }] } };
    assert.equal(getOverviewLayoutNodeSize(skill).width, 210);
    assert.equal(getOverviewLayoutNodeSize({ ...skill, data: { ...skill.data, runtimeParameterValues: { x: { value: "r".repeat(100) } } } }).width, 210);
    assert.deepEqual(getOverviewLayoutNodeSize({ type: "compound", width: 600, style: { height: 450 } }), { width: 600, height: 450 });
    assert.deepEqual(getOverviewLayoutNodeSize({ type: "parallel" }), { width: 640, height: 320 });
    assert.equal(getOverviewLayoutNodeSize({ type: "submachine", data: { localDataModel: [{ id: "#_STATE_PREFIX", expr: "x".repeat(100) }] } }).width, 210);
});
