import { Handle, Position } from "@xyflow/react";
import { FiAlertCircle } from "react-icons/fi";
import { startTargetEdgeReconnectFromEntry } from "../../utils/edgeReconnect";
import { getConfiguredAssignments } from "../../utils/stateActions";

export function NodeTitle({
    className,
    initial = false,
    typeLabel,
    badgeClassName,
    label,
    labelClassName,
    leading,
    children,
}) {
    return (
        <div className={className}>
            {leading}
            {initial && (
                <span className="initial-state-badge initial-state-badge-inline">INITIAL</span>
            )}
            {typeLabel && <span className={badgeClassName}>{typeLabel}</span>}
            {labelClassName ? <strong className={labelClassName}>{label}</strong> : label}
            {children}
        </div>
    );
}

export function IncomingTransitionHandle({
    data = {},
    handleId = "transition-target",
    className = "target-handle",
    reconnect = false,
}) {
    return (
        <Handle
            id={handleId}
            type="target"
            position={Position.Left}
            className={className}
            isConnectableStart={false}
            isConnectableEnd={true}
            onMouseDown={
                reconnect
                    ? (event) =>
                          startTargetEdgeReconnectFromEntry(event, data.reconnectIncomingEdgeId)
                    : undefined
            }
            title={
                reconnect && data.reconnectIncomingEdgeId
                    ? "Drag to reconnect the incoming transition"
                    : undefined
            }
        />
    );
}

export function StateActionBadges({ id, data }) {
    const entryCount = getConfiguredAssignments(data.onEntry).length;
    const exitCount = getConfiguredAssignments(data.onExit).length;
    if (!entryCount && !exitCount) return null;

    const openActions = (event) => {
        event.preventDefault();
        event.stopPropagation();
        data.onOpenStateActions?.(id);
    };

    return (
        <div className="state-action-badges" aria-label="Configured state actions">
            {entryCount > 0 && (
                <button
                    type="button"
                    className="state-action-badge state-action-badge-entry"
                    title={`${entryCount} onentry assignment${entryCount === 1 ? "" : "s"} \u2014 open Entry / Exit`}
                    onClick={openActions}
                >
                    onentry
                </button>
            )}
            {exitCount > 0 && (
                <button
                    type="button"
                    className="state-action-badge state-action-badge-exit"
                    title={`${exitCount} onexit assignment${exitCount === 1 ? "" : "s"} \u2014 open Entry / Exit`}
                    onClick={openActions}
                >
                    onexit
                </button>
            )}
        </div>
    );
}

export function NodeWarning({ title }) {
    return title ? (
        <div className="node-warning-badge" title={title}>
            <FiAlertCircle />
        </div>
    ) : null;
}
