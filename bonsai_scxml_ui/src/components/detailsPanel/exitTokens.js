function getExitTokenType(eventId) {
    const mainType = String(eventId || "")
        .trim()
        .toLowerCase()
        .split(".")[0];

    if (mainType === "success") return "success";
    if (mainType === "error") return "error";
    if (mainType === "fatal") return "fatal";

    return "other";
}


function sortExitTokens(events) {
    const priority = {
        success: 0,
        error: 1,
        fatal: 2,
        other: 3,
    };

    return (events || [])
        .map((event, index) => ({
            event,
            index,
            priority:
                priority[getExitTokenType(event.id)] ??
                priority.other,
        }))
        .sort(
            (a, b) =>
                a.priority - b.priority ||
                a.index - b.index
        )
        .map(({ event }) => event);
}

function getEditableExitTokens(events, includeImplicitFatal = false) {
    const editable = (events || []).filter(
        (event) => !(event?.sourceNodeId && event?.transitionHandleId)
    );

    // `fatal` is implicit only for normal executable skills. Sub-state
    // machines expose exactly the exits declared by their referenced behavior.
    if (
        includeImplicitFatal &&
        !editable.some((event) => String(event?.id || "").trim() === "fatal")
    ) {
        editable.push({ id: "fatal", description: "" });
    }

    return sortExitTokens(editable);
}


export { getExitTokenType, getEditableExitTokens };
