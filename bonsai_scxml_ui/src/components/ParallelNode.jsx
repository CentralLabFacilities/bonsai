import { Handle, NodeResizer, Position, useReactFlow } from '@xyflow/react';
import StateActionBadges from './StateActionBadges';
import { useCallback } from 'react';
import { FiChevronDown, FiChevronRight, FiPlus } from 'react-icons/fi';
import { PARALLEL_HEADER_HEIGHT } from '../utils/editorGeometry';

export default function ParallelNode({ id, data, selected = false }) {
    const isCollapsed = Boolean(data.isCollapsed);
    const { setNodes } = useReactFlow();
    const laneCount = Math.max(1, Array.isArray(data.lanes) ? data.lanes.length : 1);
    const minWidth = 280;
    const minLaneHeight = 60;
    const defaultHeaderHeight = PARALLEL_HEADER_HEIGHT;
    const defaultBottomReserve = 35;
    const minHeight = defaultHeaderHeight + defaultBottomReserve + laneCount * minLaneHeight;

    const handleResize = useCallback(
        (_event, params) => {
            const nextWidth = Number(params?.width);
            const nextHeight = Number(params?.height);

            if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
                return;
            }

            setNodes((currentNodes) => {
                const lanes = currentNodes
                    .filter(
                        (node) =>
                            node.parentId === id &&
                            node.type === 'parallelLane'
                    )
                    .sort(
                        (a, b) =>
                            Number(a.position?.y || 0) -
                            Number(b.position?.y || 0)
                    );

                if (lanes.length === 0) {
                    return currentNodes;
                }

                const firstLaneY = Math.max(
                    defaultHeaderHeight,
                    Number(lanes[0].position?.y || defaultHeaderHeight)
                );

                const availableHeight = Math.max(
                    lanes.length * minLaneHeight,
                    nextHeight - firstLaneY - defaultBottomReserve
                );

                const oldHeights = lanes.map(
                    (lane) => Number(lane.style?.height) || minLaneHeight
                );
                const oldTotalHeight = oldHeights.reduce(
                    (sum, height) => sum + height,
                    0
                );

                let nextY = firstLaneY;
                const laneGeometry = new Map();

                lanes.forEach((lane, index) => {
                    const isLast = index === lanes.length - 1;
                    const proportionalHeight =
                        oldTotalHeight > 0
                            ? (availableHeight * oldHeights[index]) / oldTotalHeight
                            : availableHeight / lanes.length;
                    const laneHeight = isLast
                        ? Math.max(
                              minLaneHeight,
                              firstLaneY + availableHeight - nextY
                          )
                        : Math.max(minLaneHeight, proportionalHeight);

                    laneGeometry.set(lane.id, {
                        y: nextY,
                        width: nextWidth,
                        height: laneHeight,
                    });
                    nextY += laneHeight;
                });

                return currentNodes.map((node) => {
                    const geometry = laneGeometry.get(node.id);
                    if (geometry) {
                        return {
                            ...node,
                            width: geometry.width,
                            height: geometry.height,
                            position: {
                                ...node.position,
                                x: 0,
                                y: geometry.y,
                            },
                            style: {
                                ...node.style,
                                width: geometry.width,
                                height: geometry.height,
                            },
                        };
                    }

                    return node;
                });
            });
        },
        [id, setNodes]
    );

    return (
        <div
        className={
            `${data.isDropTarget
                ? "parallel-group-container parallel-drop-target"
                : "parallel-group-container"} ${data.isInitial ? "initial-parallel" : ""} ${isCollapsed ? "collapsed-container" : ""}`
        }
    >
            <NodeResizer
                isVisible={selected && !isCollapsed}
                minWidth={minWidth}
                minHeight={minHeight}
                color="#0284c7"
                handleStyle={{ pointerEvents: 'all' }}
                lineStyle={{ pointerEvents: 'all' }}
                onResize={handleResize}
            />

            {/* Target-Handle links für Transitions auf den gesamten Parallel-State */}
            <StateActionBadges
                onEntry={data.onEntry}
                onExit={data.onExit}
                onEntryClick={() => data.onOpenStateActions?.(id)}
                onExitClick={() => data.onOpenStateActions?.(id)}
            />

            {/* Target handle for transitions to the entire parallel state */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="parallel-group-handle"
                isConnectableStart={false}
                isConnectableEnd={true}
            />

            <div className="parallel-group-header">
                <button
                    type="button"
                    className="container-collapse-btn nodrag nopan"
                    title={isCollapsed ? "Expand parallel" : "Collapse parallel"}
                    aria-label={isCollapsed ? "Expand parallel" : "Collapse parallel"}
                    onClick={(event) => {
                        event.stopPropagation();
                        data.onToggleCollapse?.(id);
                    }}
                >
                    {isCollapsed ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
                </button>
                {data.isInitial && (
                    <span className="initial-state-badge initial-state-badge-inline">INITIAL</span>
                )}
                <span className="parallel-badge">PARALLEL</span>
                <strong className="parallel-title">{data.label || id}</strong>
            </div>

            {!isCollapsed && <button
                className="parallel-add-lane-btn"
                title="Add new row"
                onClick={(e) => {
                    e.stopPropagation();
                    if (data.onAddLane) {
                        data.onAddLane(id);
                    }
                }}
            >
                <FiPlus size={12} />
            </button>}
        </div>
    );
}
