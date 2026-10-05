export const GENERATING_SCXML = "<!-- Generating SCXML\u2026 -->";

export const createGeneratedCodeDraft = (graph) => ({
    graph,
    code: GENERATING_SCXML,
    edited: false,
});

export const editGeneratedCodeDraft = (draft, code) => ({
    ...draft,
    code,
    edited: true,
});

export const applyGeneratedCode = (draft, graph, code) => {
    // A reply belongs to one graph snapshot, and must never replace typing.
    if (draft.graph !== graph || draft.edited) return draft;
    return { ...draft, code };
};
