import assert from "node:assert/strict";
import test from "node:test";
import {
    GENERATING_SCXML,
    applyGeneratedCode,
    createGeneratedCodeDraft,
    editGeneratedCodeDraft,
} from "../src/components/canvasCodeDraft.js";
import {
    areBehaviorLibraryPropsEqual,
    areSkillLibraryPropsEqual,
} from "../src/components/canvasLibraryProps.js";

test("generated drafts start pending for their exact graph snapshot", () => {
    const graph = { nodes: [], edges: [] };
    const draft = createGeneratedCodeDraft(graph);
    assert.equal(draft.graph, graph);
    assert.equal(draft.code, GENERATING_SCXML);
    assert.equal(draft.edited, false);
});

test("a matching generation updates an untouched draft without mutating it", () => {
    const graph = { nodes: [], edges: [] };
    const pending = createGeneratedCodeDraft(graph);
    const generated = applyGeneratedCode(pending, graph, "<scxml/>");
    assert.equal(generated.code, "<scxml/>");
    assert.equal(generated.graph, graph);
    assert.equal(pending.code, GENERATING_SCXML);
    assert.notEqual(generated, pending);
});

test("out-of-order responses cannot overwrite the current graph", () => {
    const previousGraph = { nodes: [] };
    const currentGraph = { nodes: [] };
    const pending = createGeneratedCodeDraft(currentGraph);
    assert.equal(applyGeneratedCode(pending, previousGraph, "<old/>"), pending);
    const current = applyGeneratedCode(pending, currentGraph, "<current/>");
    assert.equal(applyGeneratedCode(current, previousGraph, "<old/>"), current);
    assert.equal(current.code, "<current/>");
});

test("new snapshot identity rejects old replies even when graph inputs match", () => {
    const nodes = [];
    const oldSnapshot = { nodes };
    const newSnapshot = { nodes };
    const draft = createGeneratedCodeDraft(newSnapshot);
    assert.equal(applyGeneratedCode(draft, oldSnapshot, "<old/>"), draft);
});

for (const code of ["<user-draft/>", "", GENERATING_SCXML]) {
    test(`typing ${JSON.stringify(code)} prevents a pending response from replacing the draft`, () => {
        const graph = { nodes: [] };
        const pending = createGeneratedCodeDraft(graph);
        const edited = editGeneratedCodeDraft(pending, code);
        assert.equal(applyGeneratedCode(edited, graph, "<generated/>"), edited);
        assert.equal(edited.code, code);
        assert.equal(pending.edited, false);
    });
}

test("error fallbacks also respect user edits", () => {
    const graph = { nodes: [] };
    const edited = editGeneratedCodeDraft(createGeneratedCodeDraft(graph), "<draft/>");
    assert.equal(applyGeneratedCode(edited, graph, "<!-- recovery -->"), edited);
});

test("a changed graph starts a new draft without inheriting the old edit guard", () => {
    const oldGraph = { nodes: [] };
    const oldDraft = editGeneratedCodeDraft(createGeneratedCodeDraft(oldGraph), "<draft/>");
    const newGraph = { nodes: [] };
    const newDraft = createGeneratedCodeDraft(newGraph);
    assert.equal(oldDraft.edited, true);
    assert.equal(newDraft.edited, false);
    assert.equal(applyGeneratedCode(newDraft, oldGraph, "<old/>"), newDraft);
    assert.equal(applyGeneratedCode(newDraft, newGraph, "<new/>").code, "<new/>");
});

test("library comparators preserve semantic reference gating", () => {
    const skillProps = { packages: [], filteredSkills: [], searchText: "" };
    const behaviorProps = { directories: [], activeLibraryTab: "behaviors" };
    assert.equal(areSkillLibraryPropsEqual(skillProps, { ...skillProps }), true);
    assert.equal(areBehaviorLibraryPropsEqual(behaviorProps, { ...behaviorProps }), true);
    assert.equal(areSkillLibraryPropsEqual(skillProps, { ...skillProps, packages: [] }), false);
    assert.equal(areBehaviorLibraryPropsEqual(behaviorProps, { ...behaviorProps, directories: [] }), false);
    assert.equal(areSkillLibraryPropsEqual(skillProps, { ...skillProps, isDraggingNode: true }), true);
    assert.equal(areBehaviorLibraryPropsEqual(behaviorProps, { ...behaviorProps, isDraggingNode: true }), true);
});

for (const key of [
    "setSearchText",
    "setActiveFilter",
    "setSelectedPackage",
    "setSelectedSubPackage",
    "fetchSkillData",
    "onLibraryTabChange",
    "onReloadSkills",
]) {
    test(`skill library notices a changed ${key} callback`, () => {
        const callback = () => {};
        assert.equal(areSkillLibraryPropsEqual({ [key]: callback }, { [key]: callback }), true);
        assert.equal(areSkillLibraryPropsEqual({ [key]: callback }, { [key]: () => {} }), false);
    });
}

for (const key of ["onDirectoriesChange", "onOpenBehavior", "onLibraryTabChange"]) {
    test(`behavior library notices a changed ${key} callback`, () => {
        const callback = () => {};
        assert.equal(areBehaviorLibraryPropsEqual({ [key]: callback }, { [key]: callback }), true);
        assert.equal(areBehaviorLibraryPropsEqual({ [key]: callback }, { [key]: () => {} }), false);
    });
}

test("skill refresh and library-tab changes invalidate memoized output", () => {
    assert.equal(areSkillLibraryPropsEqual({ refreshVersion: 1 }, { refreshVersion: 2 }), false);
    assert.equal(areSkillLibraryPropsEqual({ activeLibraryTab: "skills" }, { activeLibraryTab: "behaviors" }), false);
    assert.equal(areBehaviorLibraryPropsEqual({ activeLibraryTab: "skills" }, { activeLibraryTab: "behaviors" }), false);
});
