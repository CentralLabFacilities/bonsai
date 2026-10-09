export function getVariableReferenceContext(value, caretPosition) {
    const text = String(value || "");
    const caret = Number.isInteger(caretPosition) ? caretPosition : text.length;
    const match = text.slice(0, caret).match(/@([A-Za-z0-9_:#.-]*)$/);

    if (!match) return null;

    return { start: match.index, end: caret, query: match[1] || "" };
}

export function getMatchingExpressionVariables(
    value,
    caretPosition,
    variables,
    { excludeStatePrefix = false } = {}
) {
    const context = getVariableReferenceContext(value, caretPosition);
    if (!context) return { context: null, matches: [] };

    const query = context.query.toLowerCase();
    const matches = (Array.isArray(variables) ? variables : [])
        .filter((variable) =>
            variable?.id &&
            (!excludeStatePrefix || String(variable.id).trim() !== "#_STATE_PREFIX") &&
            String(variable.id).toLowerCase().includes(query)
        )
        .sort((a, b) => {
            const aId = String(a.id).toLowerCase();
            const bId = String(b.id).toLowerCase();
            const aStarts = aId.startsWith(query) ? 0 : 1;
            const bStarts = bId.startsWith(query) ? 0 : 1;
            return aStarts - bStarts || aId.localeCompare(bId);
        })
        .slice(0, 8);

    return { context, matches };
}

export function insertExpressionVariable(value, caretPosition, variableId) {
    if (!variableId) return null;

    const context = getVariableReferenceContext(value, caretPosition);
    if (!context) return null;

    const text = String(value || "");
    const replacement = `@${variableId}`;
    return {
        value: text.slice(0, context.start) + replacement + text.slice(context.end),
        caretPosition: context.start + replacement.length,
    };
}

export function getExpressionAutocompleteAction(key, isOpen, matchCount, activeIndex) {
    if (!isOpen || matchCount === 0) return null;

    if (key === "ArrowDown") {
        return { type: "navigate", index: activeIndex < matchCount - 1 ? activeIndex + 1 : 0 };
    }
    if (key === "ArrowUp") {
        return { type: "navigate", index: activeIndex > 0 ? activeIndex - 1 : matchCount - 1 };
    }
    if (key === "Enter" || key === "Tab") {
        return {
            type: "select",
            index: activeIndex >= 0 && activeIndex < matchCount ? activeIndex : 0,
        };
    }
    if (key === "Escape") return { type: "close" };

    return null;
}
