import test from "node:test";
import assert from "node:assert/strict";
import { loadBehaviorDirectories, loadEdgeVisibility, saveEditorPreferences } from "../src/utils/editorPreferences.js";

function storageWith(value) {
    return { getItem: () => value };
}

test("behavior directories preserve custom mappings and remove only retired built-ins", () => {
    const stored = [
        { key: " robocup ", path: "/workspace", isDefault: true },
        { key: "exercise", path: "/old", isDefault: true },
        { key: "challenge", path: "/custom", isDefault: false },
        { key: 42, path: "/invalid" },
        null,
    ];
    assert.deepEqual(loadBehaviorDirectories(storageWith(JSON.stringify(stored))), [
        { key: "ROBOCUP", path: "/workspace", isDefault: true },
        { key: "CHALLENGE", path: "/custom", isDefault: false },
    ]);
    assert.deepEqual(stored[0].key, " robocup ");
    assert.deepEqual(loadBehaviorDirectories(storageWith("[]")), []);
});

test("malformed or blocked storage falls back to independent defaults", () => {
    const defaults = [{ key: "ROBOCUP", path: "/robocup_ws/robocup", isDefault: true }];
    for (const value of [null, "not JSON", "{}", "null"]) {
        assert.deepEqual(loadBehaviorDirectories(storageWith(value)), defaults);
    }
    const blocked = { getItem() { throw new Error("blocked"); } };
    assert.deepEqual(loadBehaviorDirectories(blocked), defaults);
    assert.equal(loadEdgeVisibility("slots", blocked), true);
    const first = loadBehaviorDirectories(storageWith(null));
    first[0].key = "CHANGED";
    assert.deepEqual(loadBehaviorDirectories(storageWith(null)), defaults);
});

test("edge visibility preserves the persisted string toggle semantics", () => {
    assert.equal(loadEdgeVisibility("transitions", storageWith("false")), false);
    for (const value of [null, "true", "", "0"]) {
        assert.equal(loadEdgeVisibility("slots", storageWith(value)), true);
    }
});

test("persisting preferences tolerates individual failures and keeps attempting other keys", () => {
    const writes = [];
    const preferences = { behaviorDirectories: [], showTransitionEdges: false, showSlotEdges: true };
    saveEditorPreferences(preferences, {
        setItem(key, value) {
            writes.push([key, value]);
            if (key === "bonsai.behaviorDirectories") throw new Error("quota exceeded");
        },
    });
    assert.deepEqual(writes, [
        ["bonsai.behaviorDirectories", "[]"],
        ["bonsai.showTransitionEdges", "false"],
        ["bonsai.showSlotEdges", "true"],
    ]);
});
