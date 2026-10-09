const normalizeSearch = (value) =>
    String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function createFuzzySearchIndex(items, getValues = (item) => item) {
    return (items || []).map((item) => {
        const source = getValues(item);
        const values = new Set();
        (Array.isArray(source) ? source : [source]).forEach((value) => {
            const text = normalizeSearch(value);
            if (!text) return;
            values.add(text);
            text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).forEach((word) => values.add(word));
            const words = normalizeSearch(String(value)
                .replace(/([a-z\d])([A-Z])/g, "$1 $2")
                .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2"));
            words.split(/[^\p{L}\p{N}]+/u).filter(Boolean).forEach((word) => values.add(word));
        });
        return { item, values: [...values] };
    });
}

function boundedEditDistance(query, candidate, limit) {
    if (Math.abs(query.length - candidate.length) > limit) return limit + 1;
    const missing = limit + 1;
    let beforePrevious = new Array(candidate.length + 1).fill(missing);
    let previous = new Array(candidate.length + 1).fill(missing);
    let current = new Array(candidate.length + 1).fill(missing);
    for (let j = 0; j <= Math.min(candidate.length, limit); j += 1) previous[j] = j;

    // Only the edit-distance band is visited; adjacent transpositions cost one edit.
    for (let i = 1; i <= query.length; i += 1) {
        const from = Math.max(1, i - limit);
        const to = Math.min(candidate.length, i + limit);
        current[0] = i <= limit ? i : missing;
        if (from > 1) current[from - 1] = missing;
        if (to < candidate.length) current[to + 1] = missing;
        let rowMinimum = missing;
        for (let j = from; j <= to; j += 1) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (query[i - 1] === candidate[j - 1] ? 0 : 1),
            );
            if (i > 1 && j > 1 && query[i - 1] === candidate[j - 2] && query[i - 2] === candidate[j - 1]) {
                current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
            }
            rowMinimum = Math.min(rowMinimum, current[j]);
        }
        if (rowMinimum > limit) return missing;
        const reusable = beforePrevious;
        beforePrevious = previous;
        previous = current;
        current = reusable;
    }
    return previous[candidate.length];
}

export function createFuzzyMatcher(searchText) {
    const query = normalizeSearch(searchText);
    if (!query) return () => 0;
    const words = query.split(" ");
    const allowFuzzy = query.length <= 64 && words.length <= 8;
    const terms = (allowFuzzy ? words : [query]).map((value) => ({
        value,
        subsequence: allowFuzzy && value.length >= 2 && /[\p{L}\p{N}]/u.test(value),
        edits: allowFuzzy && value.length >= 4 && value.length <= 32 && /^[\p{L}\p{N}]+$/u.test(value)
            ? value.length >= 8 ? 2 : 1
            : 0,
    }));

    return ({ values }) => {
        let score = 0;
        for (const term of terms) {
            let best = Infinity;
            for (const value of values) {
                if (value === term.value) { best = 0; break; }
                if (value.startsWith(term.value)) best = Math.min(best, 1);
                else if (value.includes(term.value)) best = Math.min(best, 2);
            }
            if (best === Infinity && term.subsequence) {
                for (const value of values) {
                    let matched = 0;
                    for (let i = 0; i < value.length; i += 1) {
                        if (value[i] === term.value[matched]) matched += 1;
                        if (matched === term.value.length) break;
                    }
                    if (matched === term.value.length) { best = 3; break; }
                }
            }
            if (best === Infinity && term.edits) {
                for (const value of values) {
                    if (Math.abs(term.value.length - value.length) > term.edits) continue;
                    const distance = boundedEditDistance(term.value, value, term.edits);
                    if (distance <= term.edits) best = Math.min(best, 3 + distance);
                    if (best === 4) break;
                }
            }
            if (best === Infinity) return null;
            score = Math.max(score, best);
        }
        return score;
    };
}

export function rankFuzzySearch(index, searchText) {
    if (!normalizeSearch(searchText)) return index.map(({ item }) => item);
    const match = createFuzzyMatcher(searchText);
    return index
        .map((entry, order) => ({ item: entry.item, score: match(entry), order }))
        .filter(({ score }) => score !== null)
        .sort((a, b) => a.score - b.score || a.order - b.order)
        .map(({ item }) => item);
}
