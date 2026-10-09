import { Handle, Position } from "@xyflow/react";
import { FiAlertCircle } from "react-icons/fi";
import { startTargetEdgeReconnectFromEntry } from "../../utils/edgeReconnect";
import { getConfiguredAssignments } from "../../utils/stateActions";

export function ConnectionHandle({
    className = "",
    isConnectable = true,
    isConnectableStart = true,
    isConnectableEnd = true,
    ...props
}) {
    const displayOnly = !isConnectableStart && !isConnectableEnd;
    return (
        <Handle
            {...props}
            className={`connection-handle ${className}`}
            isConnectable={isConnectable}
            isConnectableStart={isConnectable && isConnectableStart}
            isConnectableEnd={isConnectable && isConnectableEnd}
            role={displayOnly ? "img" : "button"}
            tabIndex={displayOnly || !isConnectable ? undefined : 0}
            aria-disabled={!displayOnly && !isConnectable ? true : undefined}
            onKeyDown={displayOnly || !isConnectable ? undefined : (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.click();
            }}
        />
    );
}

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
            {label != null && (labelClassName ? (
                <strong className={`${labelClassName} node-title-label`} title={String(label)}>
                    {label}
                </strong>
            ) : (
                <span className="node-title-label" title={String(label)}>{label}</span>
            ))}
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
    const title = reconnect && data.reconnectIncomingEdgeId
        ? "Drag to reconnect the incoming transition"
        : "Incoming transition";
    return (
        <ConnectionHandle
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
            title={title}
            aria-label={title}
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
