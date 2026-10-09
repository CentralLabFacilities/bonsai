import test from "node:test";
import assert from "node:assert/strict";
import { getContainerExitEvents, getParallelLaneSummaries, resizeParallelLanes, toggleContainerCollapse } from "../src/utils/containerState.js";
import { COLLAPSED_CONTAINER_HEIGHT, COLLAPSED_CONTAINER_WIDTH } from "../src/utils/editorGeometry.js";

test("compound and lane exits share normalization but retain their target policies", () => {
    const choice = { id: " reusable ", name: "Choice" };
    const transition = { id: " exit ", target: "destination", name: "Exit" };
    const duplicate = { id: "exit", target: "other" };
    const events = [null, { id: " " }, { id: "compound-entry", target: "child" }, choice, transition, duplicate];
    const snapshot = structuredClone(events);
    assert.deepEqual(getContainerExitEvents({ events }, "compound"), [{ ...transition, id: "exit" }]);
    assert.deepEqual(getContainerExitEvents({ events }, "parallelLane"), [
        { ...choice, id: "reusable" }, { ...transition, id: "exit" },
    ]);
    assert.deepEqual(events, snapshot);
    assert.deepEqual(getContainerExitEvents({ events: {} }, "compound"), []);
    assert.deepEqual(getContainerExitEvents({}, "parallelLane"), []);
});

test("parallel collapsed exits merge targeted events before targetless transition handles", () => {
    const targeted = { id: " exit ", target: "destination", name: "Exit" };
    const entry = { id: "compound-entry", target: "child" };
    const childHandle = { id: " child-exit ", rawEvent: "done" };
    const data = {
        events: [null, { id: " " }, { id: "reusable" }, targeted, { id: "exit", target: "other" }, entry],
        collapsedTransitionHandles: [{ id: "exit", name: "Duplicate" }, childHandle, { id: "reusable" }, { id: "child-exit" }, null],
    };
    const snapshot = structuredClone(data);
    assert.deepEqual(getContainerExitEvents(data, "parallel"), [
        { ...targeted, id: "exit" }, entry, { ...childHandle, id: "child-exit" }, { id: "reusable" },
    ]);
    assert.deepEqual(data, snapshot);
    assert.deepEqual(getContainerExitEvents({ collapsedTransitionHandles: {} }, "parallel"), []);
});

test("parallel resizing sorts direct lanes, preserves ratios, and keeps unrelated node identities", () => {
    const laneA = {
        id: "a", type: "parallelLane", parentId: "parallel", position: { x: 12, y: 80 },
        style: { height: "100", border: "none" }, data: { label: "A" },
    };
    const laneB = {
        id: "b", type: "parallelLane", parentId: "parallel", position: { x: 14, y: 180 },
        style: { height: 200 },
    };
    const parent = { id: "parallel", type: "parallel" };
    const child = { id: "child", type: "custom", parentId: "parallel" };
    const otherLane = { id: "other", type: "parallelLane", parentId: "other-parallel" };
    const nestedLane = { id: "nested", type: "parallelLane", parentId: "a" };
    const nodes = [laneB, parent, laneA, child, otherLane, nestedLane];
    const snapshot = structuredClone(nodes);
    const resized = resizeParallelLanes(nodes, "parallel", 500, 725);
    assert.deepEqual(resized.map((node) => node.id), nodes.map((node) => node.id));
    assert.deepEqual(resized[2].position, { x: 0, y: 80 });
    assert.deepEqual(resized[0].position, { x: 0, y: 280 });
    assert.equal(resized[2].width, 500);
    assert.equal(resized[2].height, 200);
    assert.equal(resized[0].height, 400);
    assert.deepEqual(resized[2].style, { height: 200, border: "none", width: 500 });
    assert.deepEqual(resized[0].style, { height: 400, width: 500 });
    assert.equal(resized[2].data, laneA.data);
    for (const index of [1, 3, 4, 5]) assert.equal(resized[index], nodes[index]);
    assert.deepEqual(nodes, snapshot);
});

test("parallel resizing retains minimum heights and the last-lane remainder behavior", () => {
    const nodes = [
        { id: "a", type: "parallelLane", parentId: "parallel", position: { y: 0 }, style: { height: 900 } },
        { id: "b", type: "parallelLane", parentId: "parallel", position: { y: 100 }, style: { height: 100 } },
    ];
    const resized = resizeParallelLanes(nodes, "parallel", 280, 200);
    assert.equal(resized[0].position.y, 64);
    assert.equal(resized[0].height, 162);
    assert.equal(resized[1].position.y, 226);
    assert.equal(resized[1].height, 90);
});

test("parallel resizing keeps fallback heights and returns the original graph without matching lanes", () => {
    const nodes = [
        { id: "a", type: "parallelLane", parentId: "parallel", position: { y: 20 } },
        { id: "b", type: "parallelLane", parentId: "parallel", position: { y: 110 }, style: { height: 0 } },
    ];
    const resized = resizeParallelLanes(nodes, "parallel", 300, 309);
    assert.equal(resized[0].height, 100);
    assert.equal(resized[1].height, 100);
    assert.equal(resized[1].position.y, 164);
    assert.equal(resizeParallelLanes(nodes, "missing", 300, 309), nodes);
    const nonpositive = nodes.map((node) => ({ ...node, style: { height: -100 } }));
    assert.deepEqual(resizeParallelLanes(nonpositive, "parallel", 300, 309).map((node) => node.height), [100, 100]);
});

test("collapsing preserves expanded dimensions and unrelated node identities", () => {
    const container = {
        id: "group", type: "compound", position: { x: 0, y: 0 },
        width: 500, height: 350, style: { minHeight: 300, border: "none" }, data: { label: "Group" },
    };
    const unrelated = { id: "other", type: "custom" };
    const nodes = [container, unrelated];
    const collapsed = toggleContainerCollapse(nodes, "group");
    assert.equal(collapsed[1], unrelated);
    assert.deepEqual(collapsed[0].data.expandedContainerSize, { width: 500, height: 350, minHeight: 300 });
    assert.equal(collapsed[0].width, COLLAPSED_CONTAINER_WIDTH);
    assert.equal(collapsed[0].height, COLLAPSED_CONTAINER_HEIGHT);
    assert.equal(collapsed[0].style.minHeight, COLLAPSED_CONTAINER_HEIGHT);
    assert.equal(collapsed[0].style.border, "none");
    assert.equal(collapsed[0].data.isCollapsed, true);
    assert.equal(container.data.isCollapsed, undefined);
    assert.equal(container.width, 500);
});

test("collapse dimension precedence remains width, measured, style, then type default", () => {
    const nodes = [
        { id: "parallel", type: "parallel", measured: { width: 610 }, style: { width: 400, height: "330" } },
        { id: "compound", type: "compound" },
    ];
    assert.deepEqual(toggleContainerCollapse(nodes, "parallel")[0].data.expandedContainerSize, {
        width: 610, height: 330, minHeight: null,
    });
    assert.deepEqual(toggleContainerCollapse(nodes, "compound")[1].data.expandedContainerSize, {
        width: 320, height: 220, minHeight: null,
    });
});

test("expansion fits the empty container and records its new size without mutating inputs", () => {
    const container = { id: "group", type: "compound", position: { x: 0, y: 0 }, width: 500, height: 350, data: {} };
    const collapsed = toggleContainerCollapse([container], "group");
    const snapshot = structuredClone(collapsed);
    const expanded = toggleContainerCollapse(collapsed, "group");
    assert.equal(expanded[0].data.isCollapsed, false);
    assert.deepEqual(expanded[0].data.expandedContainerSize, { width: 320, height: 180, minHeight: null });
    assert.deepEqual(collapsed, snapshot);
});

test("unknown and non-container IDs return the original graph", () => {
    const nodes = [{ id: "skill", type: "custom" }];
    assert.equal(toggleContainerCollapse(nodes, "missing"), nodes);
    assert.equal(toggleContainerCollapse(nodes, "skill"), nodes);
});

test("parallel lane summaries retain order and exclude synthetic wrappers and references", () => {
    const parallel = { id: "parallel", type: "parallel" };
    const laneA = { id: "a", type: "parallelLane" };
    const laneB = { id: "b", type: "parallelLane" };
    const wrapper = { id: "wrapper", type: "compound", data: { autoParallelLaneCompound: true } };
    const skill = { id: "skill", type: "custom" };
    const reference = { id: "reference", type: "custom", data: { isSkillClone: true } };
    const group = { id: "group", type: "compound" };
    const child = { id: "child", type: "custom" };
    const children = new Map([
        ["parallel", [laneA, laneB]], ["a", [wrapper, reference]],
        ["wrapper", [skill, group]], ["group", [child]],
    ]);
    const summaries = getParallelLaneSummaries(parallel, children);
    assert.deepEqual(summaries, [{ ...laneA, childCount: 3 }, { ...laneB, childCount: 0 }]);
    assert.equal(laneA.childCount, undefined);
    assert.deepEqual(getParallelLaneSummaries(skill, children), []);
});

test("malformed descendant cycles cannot hang the inspector", () => {
    const lane = { id: "lane", type: "parallelLane" };
    const child = { id: "child", type: "compound" };
    const summaries = getParallelLaneSummaries({ id: "parallel", type: "parallel" }, new Map([
        ["parallel", [lane]], ["lane", [child]], ["child", [lane]],
    ]));
    assert.equal(summaries[0].childCount, 1);
});
