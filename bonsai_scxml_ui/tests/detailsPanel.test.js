import test from "node:test";
import assert from "node:assert/strict";
import {
    areDetailsPanelPropsEqual,
    createDetailsTargetIndex,
    getAvailableActionLocations,
    getMatchingTargetNodeOptions,
    getSemanticTargetNodeIds,
    getSkillPackageName,
} from "../src/components/detailsPanelSelectors.js";

const node = (id, data = {}) => ({ id, data });

test("skill package names retain the skills marker and instance suffix semantics", () => {
    for (const [input, expected] of [
        ["org.bonsai.skills.navigation.Walk#one", "navigation"],
        ["org.bonsai.skills.Walk", ""],
        ["navigation.Walk#one", "navigation"],
        ["a..b.Walk", "a.b"],
        ["Walk", ""], ["", ""], [null, ""],
    ]) {
        assert.equal(getSkillPackageName(input), expected);
    }
});

test("target options preserve input order and the full public display shape", () => {
    const nodes = [
        node("walk", { fullSkillName: "org.bonsai.skills.navigation.Walk#one", label: "Walk" }),
        node("nop", { fullSkillName: "org.bonsai.skills.Nop", editorInstanceId: " 42 " }),
        node("ref", { fullSkillName: "p.Walk#one", label: "Walk", isSkillClone: true, editorInstanceId: " ref-1 " }),
        node("state-ref", { label: "Branch", isStateClone: true }),
        node("bare"),
    ];
    const { options } = createDetailsTargetIndex(nodes, [], "source");
    assert.deepEqual(options, [
        { id: "walk", displayName: "Walk#one", skillName: "Walk", stateName: "one", fullSkillName: "org.bonsai.skills.navigation.Walk#one", editorInstanceId: "", isReference: false, referenceId: "", packageName: "navigation" },
        { id: "nop", displayName: "Nop#42", skillName: "Nop", stateName: "#42", fullSkillName: "org.bonsai.skills.Nop", editorInstanceId: "42", isReference: false, referenceId: "", packageName: "" },
        { id: "ref", displayName: "Walk [ref-1]", skillName: "Walk", stateName: "one", fullSkillName: "p.Walk#one", editorInstanceId: "ref-1", isReference: true, referenceId: "ref-1", packageName: "p" },
        { id: "state-ref", displayName: "Branch [state-ref]", skillName: "Branch", stateName: "", fullSkillName: "", editorInstanceId: "", isReference: true, referenceId: "state-ref", packageName: "" },
        { id: "bare", displayName: "bare", skillName: "bare", stateName: "", fullSkillName: "", editorInstanceId: "", isReference: false, referenceId: "", packageName: "" },
    ]);
});

test("target naming preserves suffix fallback rather than normalizing instance names", () => {
    const { options } = createDetailsTargetIndex([
        node("same", { fullSkillName: "p.Walk#Walk" }),
        node("hash", { fullSkillName: "p.Walk##two" }),
        node("named", { fullSkillName: "p.Walk#old", editorInstanceId: "new", label: "Label" }),
        node("fallback", { fullSkillName: "#Named" }),
    ], [], "source");
    assert.deepEqual(options.map(({ displayName }) => displayName), ["Walk", "Walk#two", "Label#new", "fallback#Named"]);
});

test("semantic alias lookup preserves the earliest option across alias types", () => {
    const index = createDetailsTargetIndex([
        node("early", { fullSkillName: "same", label: "visible" }),
        node("same", { label: "other" }),
        node("visible", { label: "last" }),
    ], [], "source");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success", target: "same" }, index), ["early"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success", target: "visible" }, index), ["early"]);
    assert.equal(index.byId.get("same"), index.options[1]);
    assert.equal(index.byExactQuery.get("same"), index.options[0]);
});

test("duplicate IDs and case-insensitive exact search use first-wins option precedence", () => {
    const index = createDetailsTargetIndex([
        node("duplicate", { label: "One", fullSkillName: "match.Skill" }),
        node("duplicate", { label: "MATCH" }),
        node("third", { label: "one" }),
    ], [], "source");
    assert.equal(index.byId.get("duplicate"), index.options[0]);
    assert.equal(index.byExactQuery.get("one"), index.options[0]);
    // The earlier package-name match outranks the later skill-name match.
    assert.equal(index.byExactQuery.get("match"), index.options[0]);
});

test("semantic targets keep the declared target first, dedupe, and retain transition order", () => {
    const transitions = [
        { sourceNodeId: "other", eventId: "success", targetNodeId: "ignored" },
        { sourceNodeId: "source", eventId: "error", targetNodeId: "wrong-event" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "b" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "a" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "b" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "c" },
        { sourceNodeId: "source", eventId: "success", targetNodeId: "" },
        null,
    ];
    const index = createDetailsTargetIndex([node("a", { fullSkillName: "p.A", label: "A" })], transitions, "source");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success", target: "p.A" }, index), ["a", "b", "c"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success" }, index), ["b", "a", "c"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: "error" }, index), ["wrong-event"]);
});

test("semantic aliases are case-sensitive and unknown declared targets remain visible", () => {
    const index = createDetailsTargetIndex([node("a", { label: "Alpha" })], [], "source");
    assert.deepEqual(getSemanticTargetNodeIds({ target: "Alpha" }, index), ["a"]);
    assert.deepEqual(getSemanticTargetNodeIds({ target: "alpha" }, index), ["alpha"]);
    assert.deepEqual(getSemanticTargetNodeIds({ target: " Alpha " }, index), [" Alpha "]);
    assert.deepEqual(getSemanticTargetNodeIds({ target: "missing" }, index), ["missing"]);
    assert.deepEqual(getSemanticTargetNodeIds(null, index), []);
});

test("transition grouping preserves event coercion and strict target ID equality", () => {
    const index = createDetailsTargetIndex([], [
        { sourceNodeId: "source", eventId: 12, targetNodeId: 1 },
        { sourceNodeId: "source", eventId: "12", targetNodeId: "1" },
        { sourceNodeId: "source", eventId: 0, targetNodeId: "zero" },
        { sourceNodeId: "source", targetNodeId: "empty" },
        { sourceNodeId: "source", eventId: "", targetNodeId: null },
    ], "source");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "12" }, index), [1, "1"]);
    assert.deepEqual(getSemanticTargetNodeIds({ id: 0 }, index), ["zero", "empty"]);
    assert.deepEqual(getSemanticTargetNodeIds({}, index), ["zero", "empty"]);
});

test("target filtering searches every existing field with case-insensitive substrings", () => {
    const index = createDetailsTargetIndex([
        node("target-id", { fullSkillName: "org.skills.navigation.Walk#instance", label: "Visible" }),
        node("ref", { label: "Ref", editorInstanceId: "reference-id", isStateClone: true }),
    ], [], "source");
    for (const query of ["visible", "INSTANCE", "walk", "NAVIGATION", "target-id", "org.skills"]) {
        assert.deepEqual(getMatchingTargetNodeOptions(` ${query} `, index), [index.options[0]]);
    }
    assert.deepEqual(getMatchingTargetNodeOptions("reference-id", index), [index.options[1]]);
    assert.deepEqual(getMatchingTargetNodeOptions("not-found", index), []);
});

test("target dropdowns are unbounded and unsorted, including empty-query results", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`id-${i}`, { label: `Match${12 - i}` }));
    const index = createDetailsTargetIndex(nodes, [], "source");
    assert.equal(getMatchingTargetNodeOptions("  ", index), index.options);
    assert.deepEqual(getMatchingTargetNodeOptions("match", index), index.options);
    assert.equal(getMatchingTargetNodeOptions("match", index).length, 12);
});

test("index construction and target selection do not mutate caller inputs or shared target lists", () => {
    const nodes = Object.freeze([Object.freeze(node("a", Object.freeze({ label: "A" })))]);
    const transitions = Object.freeze([Object.freeze({ sourceNodeId: "source", eventId: "success", targetNodeId: "a" })]);
    const index = createDetailsTargetIndex(nodes, transitions, "source");
    const result = getSemanticTargetNodeIds({ id: "success" }, index);
    result.push("extra");
    assert.deepEqual(getSemanticTargetNodeIds({ id: "success" }, index), ["a"]);
    assert.deepEqual(nodes, [node("a", { label: "A" })]);
});

test("writable locations keep datamodel precedence and then parameter order", () => {
    const first = { id: "shared", expr: "1", source: "Data" };
    const data = [first, { id: "shared", expr: "2" }, { id: "data", expr: "3" }];
    const parameters = [
        { key: "shared", expr: "4" },
        { key: "param", expr: "5", id: "old", source: "old" },
        { key: "param", expr: "6" },
        { key: "last" },
    ];
    const result = getAvailableActionLocations(data, parameters, false);
    assert.deepEqual(result, [first, data[2], { key: "param", expr: "5", id: "param", source: "Parameter" }, { key: "last", id: "last", source: "Parameter" }]);
    assert.equal(result[0], first);
    assert.equal(parameters[1].id, "old");
});

test("location dedupe preserves exact ID semantics and the existing reserved-ID scope", () => {
    const result = getAvailableActionLocations([
        null, {}, { id: "" }, { id: "#_STATE_PREFIX" }, { id: " #_STATE_PREFIX " },
        { id: "name" }, { id: "Name" }, { id: " name " }, { id: 1 }, { id: "1" },
    ], [{ key: "#_STATE_PREFIX" }, { key: "" }], false);
    assert.deepEqual(result.map(({ id }) => id), ["name", "Name", " name ", 1, "1", "#_STATE_PREFIX"]);
});

test("sub-machine writable locations contain only supplied child datamodel entries", () => {
    const childData = [{ id: "child", expr: "1" }, { id: "#_STATE_PREFIX" }];
    assert.deepEqual(getAvailableActionLocations(childData, [{ key: "parameter" }], true), [childData[0]]);
    assert.deepEqual(getAvailableActionLocations(null, null, false), []);
    const index = createDetailsTargetIndex(null, null, "source");
    assert.deepEqual(index.options, []);
    assert.deepEqual(getSemanticTargetNodeIds({}, index), []);
});

test("inspector memoization detects changed, added and removed callbacks", () => {
    const selectedNode = node("selected");
    const onUpdateName = () => {};
    const previous = { selectedNode, onUpdateName };
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous }), true);
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, onUpdateName: () => {} }), false);
    assert.equal(areDetailsPanelPropsEqual(previous, { selectedNode }), false);
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, onNavigateClone: () => {} }), false);
    assert.equal(areDetailsPanelPropsEqual(previous, { ...previous, selectedNode: node("other") }), false);
});
