import test from "node:test";
import assert from "node:assert/strict";
import {
    getExpressionAutocompleteAction,
    getMatchingExpressionVariables,
    getVariableReferenceContext,
    insertExpressionVariable,
} from "../src/components/inputs/expressionAutocomplete.js";

test("reference context follows the caret, not the end of the expression", () => {
    assert.deepEqual(getVariableReferenceContext("1 + @co + @other", 7), {
        start: 4, end: 7, query: "co",
    });
    assert.deepEqual(getVariableReferenceContext("@count", 3), {
        start: 0, end: 3, query: "co",
    });
    assert.equal(getVariableReferenceContext("@count + 1", 10), null);
});

test("reference context accepts the existing ID characters and an empty query", () => {
    assert.deepEqual(getVariableReferenceContext("(@ns:key.part-1_#)", 17), {
        start: 1, end: 17, query: "ns:key.part-1_#",
    });
    assert.deepEqual(getVariableReferenceContext("@"), { start: 0, end: 1, query: "" });
    assert.deepEqual(getVariableReferenceContext("@@two"), { start: 1, end: 5, query: "two" });
    for (const value of ["", null, undefined, "@name ", "@name/", "no reference"]) {
        assert.equal(getVariableReferenceContext(value), null);
    }
});

test("missing or noninteger caret positions default to the text length", () => {
    const expected = { start: 0, end: 4, query: "one" };
    for (const caret of [undefined, null, 1.5, "2", NaN]) {
        assert.deepEqual(getVariableReferenceContext("@one", caret), expected);
    }
    assert.equal(getVariableReferenceContext("@one", 0), null);
});

test("matches rank case-insensitive prefixes before substrings, then alphabetically", () => {
    const variables = ["xCount", "counter", "Count", "discount", "unrelated"]
        .map((id) => ({ id }));
    const before = [...variables];
    const result = getMatchingExpressionVariables("@Co", 3, variables);
    assert.deepEqual(result.matches.map(({ id }) => id), ["Count", "counter", "discount", "xCount"]);
    assert.equal(result.matches[0], variables[2]);
    assert.deepEqual(variables, before);
});

test("matches retain stable ties and cap the sorted results at eight", () => {
    const first = { id: "alpha", type: "String" };
    const second = { id: "ALPHA", type: "Integer" };
    const variables = [first, second, ...Array.from({ length: 10 }, (_, i) => ({ id: `z${i}` }))];
    const matches = getMatchingExpressionVariables("@", 1, variables).matches;
    assert.equal(matches.length, 8);
    assert.equal(matches[0], first);
    assert.equal(matches[1], second);
    assert.deepEqual(matches.slice(2).map(({ id }) => id), ["z0", "z1", "z2", "z3", "z4", "z5"]);
});

test("state-action exclusion is explicit and does not exclude other reserved IDs", () => {
    const variables = [
        { id: "#_STATE_PREFIX" }, { id: " #_STATE_PREFIX " },
        { id: "#other" }, { id: "#_state_prefix" }, { id: "value" },
    ];
    assert.equal(getMatchingExpressionVariables("@", 1, variables).matches.length, 5);
    const matches = getMatchingExpressionVariables("@", 1, variables, { excludeStatePrefix: true }).matches;
    assert.deepEqual(new Set(matches.map(({ id }) => id)), new Set(["#other", "#_state_prefix", "value"]));
});

test("matching ignores missing IDs and tolerates missing variable lists", () => {
    const variables = [null, undefined, {}, { id: "" }, { id: 0 }, { id: 12 }];
    assert.deepEqual(getMatchingExpressionVariables("@1", 2, variables).matches, [{ id: 12 }]);
    for (const list of [undefined, null, {}, "variable"]) {
        assert.deepEqual(getMatchingExpressionVariables("@", 1, list).matches, []);
    }
    assert.deepEqual(getMatchingExpressionVariables("1 + 2", 5, variables), { context: null, matches: [] });
});

test("insertion replaces only the reference before the caret and preserves surrounding text", () => {
    assert.deepEqual(insertExpressionVariable("1 + @co + @other", 7, "count"), {
        value: "1 + @count + @other", caretPosition: 10,
    });
    // The existing editor does not consume the suffix of a reference past the caret.
    assert.deepEqual(insertExpressionVariable("@count", 3, "total"), {
        value: "@totalunt", caretPosition: 6,
    });
    assert.deepEqual(insertExpressionVariable("(@)", 2, "ns:key"), {
        value: "(@ns:key)", caretPosition: 8,
    });
});

test("insertion is a no-op without a reference or a selected ID", () => {
    assert.equal(insertExpressionVariable("1 + 2", 5, "count"), null);
    assert.equal(insertExpressionVariable("@co", 3, ""), null);
    assert.equal(insertExpressionVariable("@co", 3, null), null);
});

test("keyboard navigation wraps and retains the existing unselected behavior", () => {
    const action = (key, index, count = 3) => getExpressionAutocompleteAction(key, true, count, index);
    assert.deepEqual(action("ArrowDown", -1), { type: "navigate", index: 0 });
    assert.deepEqual(action("ArrowDown", 0), { type: "navigate", index: 1 });
    assert.deepEqual(action("ArrowDown", 2), { type: "navigate", index: 0 });
    assert.deepEqual(action("ArrowUp", 2), { type: "navigate", index: 1 });
    assert.deepEqual(action("ArrowUp", 0), { type: "navigate", index: 2 });
    assert.deepEqual(action("ArrowUp", -1), { type: "navigate", index: 2 });
    assert.deepEqual(action("ArrowDown", 0, 1), { type: "navigate", index: 0 });
});

test("Enter and Tab select the active suggestion, falling back to the first", () => {
    for (const key of ["Enter", "Tab"]) {
        assert.deepEqual(getExpressionAutocompleteAction(key, true, 3, 2), { type: "select", index: 2 });
        for (const index of [-1, 3, 20]) {
            assert.deepEqual(getExpressionAutocompleteAction(key, true, 3, index), { type: "select", index: 0 });
        }
    }
    assert.deepEqual(getExpressionAutocompleteAction("Escape", true, 3, 0), { type: "close" });
});

test("closed or empty autocomplete leaves navigation, commit and tab behavior to the editor", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]) {
        assert.equal(getExpressionAutocompleteAction(key, false, 3, 0), null);
        assert.equal(getExpressionAutocompleteAction(key, true, 0, -1), null);
    }
    assert.equal(getExpressionAutocompleteAction("ArrowLeft", true, 3, 0), null);
    assert.equal(getExpressionAutocompleteAction("a", true, 3, 0), null);
});
