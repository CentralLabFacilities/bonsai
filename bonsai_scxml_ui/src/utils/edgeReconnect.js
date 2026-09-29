/**
 * Start React Flow's native target-end reconnect gesture from the visible
 * target Handle of a node.
 *
 * React Flow intentionally places its invisible target reconnect anchor just
 * outside the actual node handle. Forwarding the initial mouse-down lets the
 * visible entry point act as the grab target while keeping the native
 * reconnect implementation (the existing edge is moved; no replacement edge
 * is started).
 */
export function startTargetEdgeReconnectFromEntry(event, edgeId) {
    if (
        !edgeId ||
        event?.button !== 0 ||
        typeof document === "undefined" ||
        typeof MouseEvent === "undefined"
    ) {
        return false;
    }

    const edgeElement = Array.from(
        document.querySelectorAll(".react-flow__edge")
    ).find((element) => element.dataset?.id === String(edgeId));
    const targetUpdater = edgeElement?.querySelector(
        ".react-flow__edgeupdater-target"
    );

    if (!targetUpdater) return false;

    event.preventDefault?.();
    event.stopPropagation?.();

    const nativeEvent = event.nativeEvent || event;
    targetUpdater.dispatchEvent(
        new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 1,
            clientX: nativeEvent.clientX,
            clientY: nativeEvent.clientY,
            screenX: nativeEvent.screenX,
            screenY: nativeEvent.screenY,
            ctrlKey: nativeEvent.ctrlKey,
            shiftKey: nativeEvent.shiftKey,
            altKey: nativeEvent.altKey,
            metaKey: nativeEvent.metaKey,
        })
    );

    return true;
}
