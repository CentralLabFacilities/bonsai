import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function CanvasContextMenu({ contextMenu, activeMode, hasGraphClipboard, handleSelectAction, onClose }) {
    const menuRef = useRef(null);
    const isOpen = Boolean(contextMenu);
    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!isOpen || !menu) return;
        const previous = document.activeElement;
        menu.querySelector("button:not(:disabled)")?.focus();
        return () => {
            if ((document.activeElement === document.body || menu.contains(document.activeElement)) &&
                previous?.isConnected && !previous.closest('[inert], [hidden], [aria-hidden="true"]')) previous.focus();
        };
    }, [isOpen]);

    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!contextMenu || !menu || typeof window === "undefined") return undefined;

        const viewport = window.visualViewport;
        const placeMenu = () => {
            if (!menu.isConnected) return;
            const width = viewport?.width || window.innerWidth;
            const height = viewport?.height || window.innerHeight;
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

            const padding = 8;
            const viewportLeft = viewport?.offsetLeft || 0;
            const viewportTop = viewport?.offsetTop || 0;
            const availableWidth = Math.max(0, width - padding * 2);
            menu.style.minWidth = `${Math.min(190, availableWidth)}px`;
            menu.style.maxWidth = `${Math.min(340, availableWidth)}px`;
            menu.style.maxHeight = `${Math.max(0, height - padding * 2)}px`;

            const bounds = menu.getBoundingClientRect();
            const menuWidth = Math.max(menu.offsetWidth, bounds.width);
            const menuHeight = Math.max(menu.offsetHeight, bounds.height);
            const minLeft = viewportLeft + padding;
            const minTop = viewportTop + padding;
            const maxLeft = Math.max(minLeft, viewportLeft + width - padding - menuWidth);
            const maxTop = Math.max(minTop, viewportTop + height - padding - menuHeight);
            const clickX = Number.isFinite(contextMenu.x) ? contextMenu.x : minLeft;
            const clickY = Number.isFinite(contextMenu.y) ? contextMenu.y : minTop;

            // Clamp only the visual menu; insertion actions retain the click coordinates.
            menu.style.left = `${Math.max(minLeft, Math.min(clickX, maxLeft))}px`;
            menu.style.top = `${Math.max(minTop, Math.min(clickY, maxTop))}px`;
        };

        placeMenu();
        window.addEventListener("resize", placeMenu);
        viewport?.addEventListener("resize", placeMenu);
        viewport?.addEventListener("scroll", placeMenu);
        return () => {
            window.removeEventListener("resize", placeMenu);
            viewport?.removeEventListener("resize", placeMenu);
            viewport?.removeEventListener("scroll", placeMenu);
        };
    }, [contextMenu, activeMode, hasGraphClipboard]);

    if (!contextMenu || typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={menuRef}
            className="context-menu"
            role="group"
            aria-label={contextMenu.title || "Editor actions"}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.ctrlKey || event.metaKey || event.altKey) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose?.();
                    return;
                }
                const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
                const index = buttons.indexOf(event.target);
                if (index < 0) return;
                let next;
                if (event.key === "Home") next = 0;
                else if (event.key === "End") next = buttons.length - 1;
                else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
                else if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
                else return;
                event.preventDefault();
                event.stopPropagation();
                buttons[next].focus();
            }}
        >
            <div className="context-menu-header">
                {contextMenu.title || "Editor"}
            </div>

            {contextMenu.kind === "pane" && (
                <>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("paste")}
                        disabled={!hasGraphClipboard}
                        aria-disabled={!hasGraphClipboard}
                        title={hasGraphClipboard ? "Paste copied nodes" : "Nothing copied"}
                    >
                        Paste
                    </button>
                    <div className="context-menu-divider" aria-hidden="true" />
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("compound")}
                    >
                        New Compound State
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("parallel")}
                    >
                        New Parallel State
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("submachine")}
                    >
                        New Sub-State-Machine
                    </button>
                    {(activeMode === "slots" || activeMode === "overview") && (
                        <button
                            className="context-menu-item"
                            onClick={() => handleSelectAction("slot")}
                        >
                            New Slot
                        </button>
                    )}
                </>
            )}

            {contextMenu.kind === "node" && (
                <>
                    {!contextMenu.isStructuralNode && (
                        <>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("open-details")}
                            >
                                Open details
                            </button>
                            {contextMenu.canOpenTransitions && (
                                <button
                                    className="context-menu-item"
                                    onClick={() => handleSelectAction("open-transitions")}
                                >
                                    {"Transitions\u2026"}
                                </button>
                            )}
                            {contextMenu.canSetInitial && (
                                <button
                                    className="context-menu-item"
                                    onClick={() => handleSelectAction("set-initial")}
                                >
                                    Set as initial
                                </button>
                            )}
                        </>
                    )}

                    {(contextMenu.canCreateReference || contextMenu.canAddState || contextMenu.canAddLane) && (
                        <div className="context-menu-divider" aria-hidden="true" />
                    )}

                    {contextMenu.canAddState &&
                        (contextMenu.addStateTargets || []).map((target) => (
                            <button
                                key={`add-state-${target.id}`}
                                className="context-menu-item"
                                onClick={() => handleSelectAction("add-state", target.id)}
                            >
                                {(contextMenu.addStateTargets || []).length > 1
                                    ? `Add state to ${target.label}`
                                    : "Add state"}
                            </button>
                        ))}
                    {contextMenu.canAddLane && (
                        <button
                            className="context-menu-item"
                            onClick={() => handleSelectAction("add-lane")}
                        >
                            Add lane
                        </button>
                    )}
                    {!contextMenu.isStructuralNode && contextMenu.canCreateReference && (
                        <button
                            className="context-menu-item"
                            onClick={() => handleSelectAction("clone")}
                        >
                            {contextMenu.referenceLabel || "Create reference"}
                        </button>
                    )}
                    {!contextMenu.isStructuralNode && (
                        <button
                            className="context-menu-item"
                            onClick={() => handleSelectAction("copy")}
                        >
                            Copy
                        </button>
                    )}

                    {!contextMenu.isStructuralNode && contextMenu.canWrap && (
                        <>
                            <div className="context-menu-divider" aria-hidden="true" />
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("compound")}
                            >
                                Wrap in Compound
                            </button>
                            <button
                                className="context-menu-item"
                                onClick={() => handleSelectAction("parallel")}
                            >
                                Wrap in Parallel
                            </button>
                        </>
                    )}

                    {contextMenu.canDelete && (
                        <>
                            <div className="context-menu-divider" aria-hidden="true" />
                            <button
                                className="context-menu-item context-menu-item-danger"
                                onClick={() => handleSelectAction("delete-node")}
                            >
                                Delete
                            </button>
                        </>
                    )}
                </>
            )}

            {contextMenu.kind === "edge" && !contextMenu.isSlotConnection && (
                <>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("open-transition")}
                    >
                        Open transition
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("go-source")}
                    >
                        Go to source
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("go-target")}
                    >
                        Go to target
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("change-transition-target")}
                    >
                        {"Change target\u2026"}
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("create-control-point")}
                    >
                        Create control point here
                    </button>
                    <div className="context-menu-divider" aria-hidden="true" />
                    <button
                        className="context-menu-item context-menu-item-danger"
                        onClick={() => handleSelectAction("delete-transition")}
                    >
                        Delete transition
                    </button>
                </>
            )}

            {contextMenu.kind === "edge" && contextMenu.isSlotConnection && (
                <>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("open-slot-connection")}
                    >
                        Open slot connection
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("go-slot-skill")}
                    >
                        Go to skill
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("go-slot-node")}
                    >
                        Go to slot
                    </button>
                    <button
                        className="context-menu-item"
                        onClick={() => handleSelectAction("create-control-point")}
                    >
                        Create control point here
                    </button>
                    <div className="context-menu-divider" aria-hidden="true" />
                    <button
                        className="context-menu-item context-menu-item-danger"
                        onClick={() => handleSelectAction("disconnect-slot")}
                    >
                        Disconnect
                    </button>
                </>
            )}

            {contextMenu.kind === "control-point" && (
                <button
                    className="context-menu-item context-menu-item-danger"
                    onClick={() => handleSelectAction("remove-control-point")}
                >
                    Remove control point
                </button>
            )}
        </div>,
        document.body
    );
}
