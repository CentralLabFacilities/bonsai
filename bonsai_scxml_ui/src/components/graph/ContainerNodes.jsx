import { Handle, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { FiChevronDown, FiChevronRight, FiPlus } from "react-icons/fi";
import { IncomingTransitionHandle, NodeTitle, StateActionBadges } from "./NodeChrome";
import { getContainerExitEvents, resizeParallelLanes } from "../../utils/containerState.js";
import { PARALLEL_BOTTOM_PADDING, PARALLEL_HEADER_HEIGHT } from "../../utils/editorGeometry.js";

function ContainerHeader({ id, data, type }) {
    const isParallel = type === "parallel";
    const isCollapsed = Boolean(data.isCollapsed);
    const collapseLabel = `${isCollapsed ? "Expand" : "Collapse"} ${type}`;

    return (
        <NodeTitle
            className={isParallel ? "parallel-group-header" : "compound-frame-header"}
            initial={data.isInitial && (isParallel || !data.autoParallelLaneCompound)}
            typeLabel={isParallel ? "PARALLEL" : "COMPOUND"}
            badgeClassName={isParallel ? "parallel-badge" : "compound-frame-badge"}
            label={data.label || (isParallel ? id : "Compound")}
            labelClassName={isParallel ? "parallel-title" : "compound-frame-title"}
            leading={
                <button
                    type="button"
                    className="container-collapse-btn nodrag nopan"
                    title={collapseLabel}
                    aria-label={collapseLabel}
                    onClick={(event) => {
                        event.stopPropagation();
                        data.onToggleCollapse?.(id);
                    }}
                >
                    {isCollapsed ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
                </button>
            }
        />
    );
}

function CollapsedSlotAnchor({ data }) {
    if (!data.isCollapsed || (data.mode !== "slots" && data.mode !== "overview")) return null;
    return (
        <Handle
            id="collapsed-slot-source"
            type="source"
            position={Position.Bottom}
            className="collapsed-slot-source-handle"
            isConnectableStart={false}
            isConnectableEnd={false}
        />
    );
}

function BoundaryExits({ events }) {
    if (events.length === 0) return null;
    return (
        <div className="compound-frame-exits">
            {events.map((event) => {
                const label = event.name || event.rawEvent || event.id;
                return (
                    <div className="compound-frame-exit-item" key={event.id}>
                        {/* Internal helper edges arrive at the label; transitions leave at the border. */}
                        <Handle
                            id={`target-${event.id}`}
                            type="target"
                            position={Position.Left}
                            className="compound-frame-exit-target-handle"
                            style={{ opacity: 0, pointerEvents: "none" }}
                            isConnectableStart={false}
                            isConnectableEnd={false}
                        />
                        <span className="compound-frame-exit-label" title={label}>
                            {label}
                        </span>
                        <Handle
                            id={event.id}
                            type="source"
                            position={Position.Right}
                            className="compound-frame-source-handle"
                            isConnectableStart={true}
                            isConnectableEnd={false}
                        />
                    </div>
                );
            })}
        </div>
    );
}

export function CompoundNode({ id, data = {}, selected = false }) {
    const isCollapsed = Boolean(data.isCollapsed);
    const isParallelLaneWrapper = Boolean(data.autoParallelLaneCompound);
    const events = getContainerExitEvents(data, "compound");

    return (
        <div
            className={`compound-frame-node ${
                isParallelLaneWrapper ? "parallel-lane-auto-compound" : ""
            } ${
                data.isInitial ? "initial-compound" : ""
            } ${selected ? "selected-compound" : ""} ${
                data.isDropTarget ? "compound-drop-target" : ""
            } ${isCollapsed ? "collapsed-container" : ""}`}
        >
            <NodeResizer
                isVisible={selected && !isCollapsed && !isParallelLaneWrapper}
                minWidth={220}
                minHeight={120}
                color="#475569"
                handleStyle={{ pointerEvents: "all" }}
                lineStyle={{ pointerEvents: "all" }}
            />
            <IncomingTransitionHandle />
            {/* Display-only anchor for the compound's initial-child arrow. */}
            <Handle
                id="compound-entry"
                type="source"
                position={Position.Right}
                className="compound-frame-entry-handle"
                style={{
                    top: "50%",
                    left: "-5px",
                    right: "auto",
                    opacity: 0,
                    pointerEvents: "none",
                }}
                isConnectableStart={false}
                isConnectableEnd={false}
            />
            <ContainerHeader id={id} data={data} type="compound" />
            <CollapsedSlotAnchor data={data} />
            {!isCollapsed && <BoundaryExits events={events} />}
            {isCollapsed && events.map((event) => (
                <Handle
                    key={`collapsed-source-${event.id}`}
                    id={event.id}
                    type="source"
                    position={Position.Right}
                    className="compound-frame-source-handle compound-collapsed-source-handle"
                    isConnectableStart={true}
                    isConnectableEnd={false}
                />
            ))}
        </div>
    );
}

export function ParallelNode({ id, data, selected = false }) {
    const isCollapsed = Boolean(data.isCollapsed);
    const events = getContainerExitEvents(data, "parallel");
    const { setNodes } = useReactFlow();
    const laneCount = Math.max(1, Array.isArray(data.lanes) ? data.lanes.length : 1);
    const minHeight = PARALLEL_HEADER_HEIGHT + PARALLEL_BOTTOM_PADDING + laneCount * 90;
    const handleResize = useCallback((_event, params) => {
        const width = Number(params?.width);
        const height = Number(params?.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) return;
        setNodes((nodes) => resizeParallelLanes(nodes, id, width, height));
    }, [id, setNodes]);

    return (
        <div
            className={`${data.isDropTarget
                ? "parallel-group-container parallel-drop-target"
                : "parallel-group-container"} ${data.isInitial ? "initial-parallel" : ""} ${isCollapsed ? "collapsed-container" : ""}`}
        >
            <NodeResizer
                isVisible={selected && !isCollapsed}
                minWidth={280}
                minHeight={minHeight}
                color="#0284c7"
                handleStyle={{ pointerEvents: "all" }}
                lineStyle={{ pointerEvents: "all" }}
                onResize={handleResize}
            />
            <StateActionBadges id={id} data={data} />
            <IncomingTransitionHandle handleId="target" className="parallel-group-handle" />
            <ContainerHeader id={id} data={data} type="parallel" />
            <CollapsedSlotAnchor data={data} />
            {isCollapsed && events.map((event, index) => (
                <Handle
                    key={`collapsed-parallel-source-${event.id}`}
                    id={event.id}
                    type="source"
                    position={Position.Right}
                    className="parallel-collapsed-source-handle"
                    style={{
                        top: `${Math.min(78, 42 + index * 14)}%`,
                        left: "auto",
                        right: "-6px",
                    }}
                    isConnectableStart={true}
                    isConnectableEnd={false}
                />
            ))}
            {!isCollapsed && (
                <button
                    className="parallel-add-lane-btn"
                    title="Add new row"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (data.onAddLane) data.onAddLane(id);
                    }}
                >
                    <FiPlus size={12} />
                </button>
            )}
        </div>
    );
}

export function ParallelLaneNode({ id, data = {}, selected = false }) {
    const events = getContainerExitEvents(data, "parallelLane");

    return (
        <div
            className={`parallel-lane-node ${selected ? "parallel-lane-selected" : ""}`}
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                boxSizing: "border-box",
                pointerEvents: "none",
            }}
        >
            <div
                className="parallel-lane-name nodrag nopan"
                title={data.label || id || "Parallel lane"}
            >
                {data.label || id || "Lane"}
            </div>
            {/* Display-only entry point for this parallel branch. */}
            <Handle
                type="source"
                position={Position.Right}
                id="parallel-entry"
                className="target-handle"
                style={{
                    top: "50%",
                    left: "-5px",
                    right: "auto",
                    backgroundColor: "#0284c7",
                    borderColor: "#ffffff",
                }}
                isConnectableStart={false}
                isConnectableEnd={false}
            />
            <BoundaryExits events={events} />
        </div>
    );
}
