export default function CanvasContextMenu({ contextMenu, activeMode, hasGraphClipboard, handleSelectAction }) {
    if (!contextMenu) return null;

    return (
        <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
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
        </div>
    );
}
