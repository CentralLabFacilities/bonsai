import test from "node:test";
import assert from "node:assert/strict";
import { createFuzzyMatcher, createFuzzySearchIndex, rankFuzzySearch } from "../src/utils/fuzzySearch.js";

test("fuzzy ranking is exact, prefix, contiguous, subsequence, then bounded typos", () => {
    const items = Object.freeze(["wrok", "wo---r---k", "homework", "worker", "work", "word"]);
    const index = createFuzzySearchIndex(items);
    assert.deepEqual(rankFuzzySearch(index, "WORK"), ["work", "worker", "homework", "wo---r---k", "wrok", "word"]);
    assert.deepEqual(index.map(createFuzzyMatcher("work")), [4, 3, 2, 1, 0, 4]);
    assert.deepEqual(items, ["wrok", "wo---r---k", "homework", "worker", "work", "word"]);
});

test("ties and empty or whitespace queries preserve original order and object identity", () => {
    const items = Object.freeze([
        Object.freeze({ name: "worker", id: "second" }),
        Object.freeze({ name: "working", id: "first" }),
        Object.freeze({ name: "unrelated", id: "last" }),
    ]);
    const index = createFuzzySearchIndex(items, (item) => item.name);
    for (const query of ["", "  \t\n ", null, undefined]) {
        const result = rankFuzzySearch(index, query);
        assert.deepEqual(result, items);
        result.forEach((item, i) => assert.equal(item, items[i]));
    }
    assert.deepEqual(rankFuzzySearch(index, "work"), items.slice(0, 2));
});

test("skill names, packages, full identifiers and camel-case words use the same matcher", () => {
    const walk = "org.bonsai.skills.navigation.Walk";
    const grasp = "org.bonsai.skills.grasping.GraspObject";
    const index = createFuzzySearchIndex([grasp, walk]);
    for (const query of ["walk", "wlk", "navigtaion", "nav wlak", "bonsai skls wlk"]) {
        assert.deepEqual(rankFuzzySearch(index, query), [walk], query);
    }
    for (const query of ["grasp object", "grspobj", "GraspObject", "grasping"]) {
        assert.deepEqual(rankFuzzySearch(index, query), [grasp], query);
    }
    assert.deepEqual(rankFuzzySearch(index, "navigation grasp"), []);
});

test("behavior name, symbolic package and filesystem path fields stay searchable without changing payloads", () => {
    const first = Object.freeze({ name: "Walk.scxml", path: "/robot/missions/Walk.scxml", source: "${ROOT}/missions/Walk.scxml" });
    const other = Object.freeze({ name: "Wait.xml", path: "/robot/Wait.xml", source: "${ROOT}/Wait.xml" });
    const index = createFuzzySearchIndex([other, first], (entry) => [entry.name, entry.path, entry.source, "ROOT"]);
    for (const query of ["wlk", "wlak", "missions", "ROOT wlak", "/robot/missions", "${ROOT}/missions"]) {
        assert.deepEqual(rankFuzzySearch(index, query), [first], query);
        assert.equal(rankFuzzySearch(index, query)[0], first);
    }
    assert.deepEqual(rankFuzzySearch(index, "ROOT"), [other, first]);
});

test("noncontiguous and multi-word queries match every term and rank by the weakest term", () => {
    const index = createFuzzySearchIndex(["nav wrok", "navigation work", "nav work", "nav wait"]);
    assert.deepEqual(rankFuzzySearch(index, "nav work"), ["nav work", "navigation work", "nav wrok"]);
    assert.deepEqual(rankFuzzySearch(index, "work nav"), ["nav work", "navigation work", "nav wrok"]);
    assert.deepEqual(rankFuzzySearch(createFuzzySearchIndex(["moveRobotArm"]), "mvrbtarm"), ["moveRobotArm"]);
});

test("typos allow adjacent transposition, insertion, deletion and substitution within a small budget", () => {
    const index = createFuzzySearchIndex(["abcd", "abcdefgh"]);
    for (const query of ["abdc", "abxcd", "abxd"]) assert.equal(rankFuzzySearch(index, query)[0], "abcd", query);
    assert.equal(createFuzzyMatcher("abd")(index[0]), 3, "deletions already matched as subsequences outrank typos");
    assert.equal(createFuzzyMatcher("axcdefgh")(index[1]), 4);
    assert.equal(createFuzzyMatcher("axydefgh")(index[1]), 5);
    assert.equal(createFuzzyMatcher("axyzefgh")(index[1]), null);
    assert.equal(createFuzzyMatcher("axyd")(index[0]), null, "four-letter queries get only one edit");
});

test("short, punctuation-only and very long queries do not broaden into noisy typo matches", () => {
    const index = createFuzzySearchIndex(["ab", "adc", "a...b", "path.name"]);
    assert.equal(createFuzzyMatcher("ax")(index[0]), null);
    assert.equal(createFuzzyMatcher("abc")(index[1]), null);
    assert.equal(createFuzzyMatcher("ab")(index[2]), 3);
    assert.deepEqual(rankFuzzySearch(index, "."), ["a...b", "path.name"]);
    const long = "a".repeat(65);
    const longIndex = createFuzzySearchIndex([long, `${long}b`, `${"a".repeat(32)}x${"a".repeat(33)}`]);
    assert.deepEqual(rankFuzzySearch(longIndex, long), [long, `${long}b`]);
    assert.equal(createFuzzyMatcher(`${"a".repeat(32)}b`)(createFuzzySearchIndex(["a".repeat(33)])[0]), null);
    const manyTerms = "alpha beta gamma delta epsilon zeta eta theta iota";
    assert.deepEqual(rankFuzzySearch(createFuzzySearchIndex([manyTerms.replaceAll(" ", "/"), manyTerms]), manyTerms), [manyTerms]);
});

test("normalization supports Unicode, whitespace, absent fields and duplicate search aliases", () => {
    const index = createFuzzySearchIndex([null, "  \t ", "\u00c4pfel", "\u00c4---p---f---e---l"], (value) => [value, value, undefined]);
    assert.deepEqual(index[0].values, []);
    assert.equal(index[2].values.length, 1);
    assert.deepEqual(rankFuzzySearch(index, "  \u00e4PFEL  "), ["\u00c4pfel", "\u00c4---p---f---e---l"]);
    assert.deepEqual(rankFuzzySearch(createFuzzySearchIndex(["a  b"]), "a\t b"), ["a  b"]);
});

test("indexes read source fields once rather than per query and preserve duplicate items", () => {
    let reads = 0;
    const items = Object.freeze(Array.from({ length: 400 }, (_, i) => Object.freeze({
        id: i,
        get name() { reads += 1; return `navigation.Walk${i}`; },
    })));
    const index = createFuzzySearchIndex(items, (item) => item.name);
    assert.equal(reads, items.length);
    for (const query of ["walk", "wlk", "nav", "navigtaion", "unmatched", ""]) rankFuzzySearch(index, query);
    assert.equal(reads, items.length);
    const duplicates = createFuzzySearchIndex([items[0], items[0]], (item) => item.name);
    assert.deepEqual(rankFuzzySearch(duplicates, "walk"), [items[0], items[0]]);
});

test("bounded typo scoring agrees with a full edit-distance reference near both budget limits", () => {
    const reference = (query, word) => {
        const rows = Array.from({ length: query.length + 1 }, (_, i) =>
            Array.from({ length: word.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
        for (let i = 1; i <= query.length; i += 1) {
            for (let j = 1; j <= word.length; j += 1) {
                rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (query[i - 1] === word[j - 1] ? 0 : 1));
                if (i > 1 && j > 1 && query[i - 1] === word[j - 2] && query[i - 2] === word[j - 1]) {
                    rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
                }
            }
        }
        return rows[query.length][word.length];
    };
    for (const word of ["abcd", "abcdef", "abcdefgh"]) {
        const indexed = createFuzzySearchIndex([word])[0];
        const queries = new Set([`xx${word}`, `x${word.slice(1, -1)}y`, `${word}xyz`]);
        for (let i = 0; i < word.length; i += 1) {
            queries.add(`${word.slice(0, i)}x${word.slice(i + 1)}`);
            queries.add(`${word.slice(0, i)}x${word.slice(i)}`);
            queries.add(word.slice(0, i) + word.slice(i + 1));
            if (i < word.length - 1) queries.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
        }
        for (const query of queries) {
            if (query.length < 4) continue;
            let cursor = 0;
            for (const char of word) if (char === query[cursor]) cursor += 1;
            const distance = reference(query, word);
            const budget = query.length >= 8 ? 2 : 1;
            const expected = word === query ? 0 : word.startsWith(query) ? 1 : word.includes(query) ? 2
                : cursor === query.length ? 3 : distance <= budget ? 3 + distance : null;
            assert.equal(createFuzzyMatcher(query)(indexed), expected, `${word} / ${query}`);
        }
    }
});
