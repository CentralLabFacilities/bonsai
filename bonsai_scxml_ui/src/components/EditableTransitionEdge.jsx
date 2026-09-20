import { useCallback, useEffect, useMemo, useRef } from "react";
import {
    BaseEdge,
    EdgeLabelRenderer,
    Position,
    getBezierPath,
    useNodes,
    useReactFlow,
} from "@xyflow/react";
import {
    createSmartEdge,
    getSmartEdge,
    smartEdgePresets,
} from "@tisoap/react-flow-smart-edge";

const AUTO_ROUTING_OPTIONS = {
    routeOnlyWhenBlocked: true,
    gridRatio: 4,
    nodePadding: 32,
};

const MANUAL_ROUTING_OPTIONS = {
    ...smartEdgePresets.simplebezier,
    routeOnlyWhenBlocked: false,
    gridRatio: 4,
    nodePadding: 32,
};

const AutoSmartTransitionEdge = createSmartEdge(
    "bezier",
    AUTO_ROUTING_OPTIONS
);

const CONTROL_POINT_SIZE = 14;
const ADD_POINT_SIZE = 18;

const distanceSquared = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
};

const getFacingPosition = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
            ? Position.Right
            : Position.Left;
    }

    return dy >= 0
        ? Position.Bottom
        : Position.Top;
};

const stripMoveCommand = (path) =>
    String(path || "")
        .replace(
            /^\s*M\s*-?\d*\.?\d+(?:e[-+]?\d+)?[ ,]+-?\d*\.?\d+(?:e[-+]?\d+)?\s*/i,
            ""
        )
        .trim();

const getFallbackSegmentPath = (
    from,
    to,
    sourcePosition,
    targetPosition
) => {
    const [path] = getBezierPath({
        sourceX: from.x,
        sourceY: from.y,
        targetX: to.x,
        targetY: to.y,
        sourcePosition:
            sourcePosition ||
            getFacingPosition(from, to),
        targetPosition:
            targetPosition ||
            getFacingPosition(to, from),
        curvature: 0.42,
    });

    return path;
};

const getRoutedSegmentPath = (
    from,
    to,
    nodes,
    sourcePosition = null,
    targetPosition = null
) => {
    const resolvedSourcePosition =
        sourcePosition ||
        getFacingPosition(from, to);

    const resolvedTargetPosition =
        targetPosition ||
        getFacingPosition(to, from);

    const result = getSmartEdge({
        sourceX: from.x,
        sourceY: from.y,
        targetX: to.x,
        targetY: to.y,
        sourcePosition: resolvedSourcePosition,
        targetPosition: resolvedTargetPosition,
        nodes,
        options: MANUAL_ROUTING_OPTIONS,
    });

    if (
        result instanceof Error ||
        !result?.svgPathString
    ) {
        return getFallbackSegmentPath(
            from,
            to,
            resolvedSourcePosition,
            resolvedTargetPosition
        );
    }

    return result.svgPathString;
};

const resolveControlPoint = (
    point,
    source,
    target
) => {
    const anchor =
        point.anchor === "target"
            ? target
            : source;

    return {
        id: point.id,
        x: anchor.x + Number(point.dx || 0),
        y: anchor.y + Number(point.dy || 0),
        anchor:
            point.anchor === "target"
                ? "target"
                : "source",
    };
};

const makeRelativeControlPoint = (
    absolutePoint,
    source,
    target,
    id
) => {
    const sourceDistance = distanceSquared(
        absolutePoint,
        source
    );

    const targetDistance = distanceSquared(
        absolutePoint,
        target
    );

    const anchorName =
        sourceDistance <= targetDistance
            ? "source"
            : "target";

    const anchor =
        anchorName === "source"
            ? source
            : target;

    return {
        id,
        anchor: anchorName,
        dx: absolutePoint.x - anchor.x,
        dy: absolutePoint.y - anchor.y,
    };
};

function ManualEditableTransitionEdge(
    props
) {
    const {
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        markerEnd,
        markerStart,
        style,
        selected,
        data,
        label,
        labelStyle,
        interactionWidth = 20,
    } = props;

    const nodes = useNodes();

    const {
        setEdges,
        screenToFlowPosition,
    } = useReactFlow();

    const activeDragRef = useRef(null);

    const sourcePoint = useMemo(
        () => ({
            x: sourceX,
            y: sourceY,
        }),
        [sourceX, sourceY]
    );

    const targetPoint = useMemo(
        () => ({
            x: targetX,
            y: targetY,
        }),
        [targetX, targetY]
    );

    const storedControlPoints =
        Array.isArray(data?.controlPoints)
            ? data.controlPoints
            : [];

    /*
     * Keep a synchronous reference to the latest points.
     *
     * This matters during pointer dragging because multiple
     * pointermove events can occur before React has rendered
     * the previous state update.
     */
    const controlPointsRef = useRef(
        storedControlPoints
    );

    useEffect(() => {
        controlPointsRef.current =
            storedControlPoints;
    }, [storedControlPoints]);

    const controlPoints = useMemo(
        () =>
            storedControlPoints.map(
                (point) =>
                    resolveControlPoint(
                        point,
                        sourcePoint,
                        targetPoint
                    )
            ),
        [
            storedControlPoints,
            sourcePoint,
            targetPoint,
        ]
    );

    const updateControlPoints = useCallback(
        (updater) => {
            const nextPoints = updater(
                controlPointsRef.current
            );

            controlPointsRef.current =
                nextPoints;

            /*
             * Persist into the actual owner.
             *
             * App.jsx supplies this callback for both:
             * - normal transition edges
             * - slot edges
             */
            data?.onControlPointsChange?.(
                nextPoints
            );

            /*
             * Also update React Flow immediately so
             * dragging remains visually responsive.
             */
            setEdges((currentEdges) =>
                currentEdges.map((edge) =>
                    edge.id === id
                        ? {
                            ...edge,
                            data: {
                                ...(edge.data ||
                                    {}),
                                controlPoints:
                                nextPoints,
                            },
                        }
                        : edge
                )
            );
        },
        [
            data,
            id,
            setEdges,
        ]
    );

    const addControlPoint = useCallback(
        (
            segmentIndex,
            absolutePoint
        ) => {
            const pointId =
                `cp-${crypto.randomUUID()}`;

            const relativePoint =
                makeRelativeControlPoint(
                    absolutePoint,
                    sourcePoint,
                    targetPoint,
                    pointId
                );

            updateControlPoints(
                (currentPoints) => {
                    const next = [
                        ...currentPoints,
                    ];

                    next.splice(
                        segmentIndex,
                        0,
                        relativePoint
                    );

                    return next;
                }
            );
        },
        [
            sourcePoint,
            targetPoint,
            updateControlPoints,
        ]
    );

    const removeControlPoint =
        useCallback(
            (pointId) => {
                updateControlPoints(
                    (currentPoints) =>
                        currentPoints.filter(
                            (point) =>
                                point.id !==
                                pointId
                        )
                );
            },
            [updateControlPoints]
        );

    const beginControlPointDrag =
        useCallback(
            (event, pointId) => {
                event.preventDefault();
                event.stopPropagation();

                event.currentTarget
                    .setPointerCapture?.(
                    event.pointerId
                );

                activeDragRef.current =
                    pointId;

                const handlePointerMove = (
                    moveEvent
                ) => {
                    if (
                        activeDragRef.current !==
                        pointId
                    ) {
                        return;
                    }

                    const flowPoint =
                        screenToFlowPosition({
                            x:
                            moveEvent.clientX,
                            y:
                            moveEvent.clientY,
                        });

                    const relativePoint =
                        makeRelativeControlPoint(
                            flowPoint,
                            sourcePoint,
                            targetPoint,
                            pointId
                        );

                    updateControlPoints(
                        (currentPoints) =>
                            currentPoints.map(
                                (point) =>
                                    point.id ===
                                    pointId
                                        ? relativePoint
                                        : point
                            )
                    );
                };

                const handlePointerUp =
                    () => {
                        activeDragRef.current =
                            null;

                        window.removeEventListener(
                            "pointermove",
                            handlePointerMove
                        );

                        window.removeEventListener(
                            "pointerup",
                            handlePointerUp
                        );
                    };

                window.addEventListener(
                    "pointermove",
                    handlePointerMove
                );

                window.addEventListener(
                    "pointerup",
                    handlePointerUp,
                    {
                        once: true,
                    }
                );
            },
            [
                screenToFlowPosition,
                sourcePoint,
                targetPoint,
                updateControlPoints,
            ]
        );

    const routePoints = [
        sourcePoint,
        ...controlPoints,
        targetPoint,
    ];

    const routedSegments = [];

    for (
        let index = 0;
        index < routePoints.length - 1;
        index += 1
    ) {
        const isFirstSegment =
            index === 0;

        const isLastSegment =
            index ===
            routePoints.length - 2;

        routedSegments.push(
            getRoutedSegmentPath(
                routePoints[index],
                routePoints[index + 1],
                nodes,
                isFirstSegment
                    ? sourcePosition
                    : null,
                isLastSegment
                    ? targetPosition
                    : null
            )
        );
    }

    const combinedPath =
        routedSegments
            .map(
                (
                    segmentPath,
                    index
                ) => {
                    if (index === 0) {
                        return segmentPath;
                    }

                    const remainder =
                        stripMoveCommand(
                            segmentPath
                        );

                    return remainder
                        ? remainder
                        : segmentPath;
                }
            )
            .join(" ");

    const segmentMidpoints =
        routePoints
            .slice(0, -1)
            .map(
                (point, index) => {
                    const nextPoint =
                        routePoints[
                        index + 1
                            ];

                    return {
                        x:
                            (
                                point.x +
                                nextPoint.x
                            ) / 2,
                        y:
                            (
                                point.y +
                                nextPoint.y
                            ) / 2,
                        insertIndex:
                        index,
                    };
                }
            );

    const labelPoint =
        segmentMidpoints[
            Math.floor(
                segmentMidpoints.length /
                2
            )
            ] || {
            x:
                (sourceX +
                    targetX) /
                2,
            y:
                (sourceY +
                    targetY) /
                2,
        };

    return (
        <>
            <BaseEdge
                id={id}
                path={combinedPath}
                markerStart={markerStart}
                markerEnd={markerEnd}
                style={style}
                interactionWidth={
                    interactionWidth
                }
            />

            <EdgeLabelRenderer>
                {label && (
                    <div
                        style={{
                            position:
                                "absolute",
                            transform:
                                `translate(-50%, -50%) ` +
                                `translate(${labelPoint.x}px, ${labelPoint.y}px)`,
                            pointerEvents:
                                "none",
                            fontSize: 11,
                            color:
                                "#cbd5e1",
                            ...(labelStyle ||
                                {}),
                        }}
                    >
                        {label}
                    </div>
                )}

                {selected &&
                    segmentMidpoints.map(
                        (midpoint) => (
                            <button
                                key={`add-${midpoint.insertIndex}`}
                                type="button"
                                className="nodrag nopan"
                                title="Add control point"
                                onClick={(
                                    event
                                ) => {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    addControlPoint(
                                        midpoint.insertIndex,
                                        midpoint
                                    );
                                }}
                                style={{
                                    position:
                                        "absolute",
                                    transform:
                                        `translate(-50%, -50%) ` +
                                        `translate(${midpoint.x}px, ${midpoint.y}px)`,
                                    width:
                                    ADD_POINT_SIZE,
                                    height:
                                    ADD_POINT_SIZE,
                                    padding:
                                        0,
                                    borderRadius:
                                        "999px",
                                    border:
                                        "1px solid #64748b",
                                    background:
                                        "#111827",
                                    color:
                                        "#e2e8f0",
                                    fontSize:
                                        14,
                                    lineHeight:
                                        1,
                                    cursor:
                                        "pointer",
                                    pointerEvents:
                                        "all",
                                    display:
                                        "flex",
                                    alignItems:
                                        "center",
                                    justifyContent:
                                        "center",
                                    zIndex:
                                        1001,
                                }}
                            >
                                +
                            </button>
                        )
                    )}

                {selected &&
                    controlPoints.map(
                        (point) => (
                            <button
                                key={
                                    point.id
                                }
                                type="button"
                                className="nodrag nopan"
                                title={`${
                                    point.anchor ===
                                    "source"
                                        ? "Source"
                                        : "Target"
                                }-relative control point. Drag to move, double-click to remove.`}
                                onPointerDown={(
                                    event
                                ) =>
                                    beginControlPointDrag(
                                        event,
                                        point.id
                                    )
                                }
                                onClick={(
                                    event
                                ) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                                onDoubleClick={(
                                    event
                                ) => {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    removeControlPoint(
                                        point.id
                                    );
                                }}
                                style={{
                                    position:
                                        "absolute",
                                    transform:
                                        `translate(-50%, -50%) ` +
                                        `translate(${point.x}px, ${point.y}px)`,
                                    width:
                                    CONTROL_POINT_SIZE,
                                    height:
                                    CONTROL_POINT_SIZE,
                                    padding:
                                        0,
                                    borderRadius:
                                        "999px",
                                    border:
                                        "2px solid #e2e8f0",
                                    background:
                                        point.anchor ===
                                        "source"
                                            ? "#2563eb"
                                            : "#7c3aed",
                                    boxShadow:
                                        "0 0 0 2px rgba(15, 23, 42, 0.9)",
                                    cursor:
                                        "grab",
                                    pointerEvents:
                                        "all",
                                    zIndex:
                                        1002,
                                }}
                            />
                        )
                    )}
            </EdgeLabelRenderer>
        </>
    );
}

function AutoEditableTransitionEdge(props) {
    const {
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        selected,
        data,
    } = props;
    const { setEdges } = useReactFlow();

    const addInitialControlPoint = useCallback(
        (event) => {
            event.preventDefault();
            event.stopPropagation();

            const sourcePoint = { x: sourceX, y: sourceY };
            const targetPoint = { x: targetX, y: targetY };
            const midpoint = {
                x: (sourceX + targetX) / 2,
                y: (sourceY + targetY) / 2,
            };
            const nextPoints = [
                makeRelativeControlPoint(
                    midpoint,
                    sourcePoint,
                    targetPoint,
                    `cp-${crypto.randomUUID()}`
                ),
            ];

            data?.onControlPointsChange?.(nextPoints);
            setEdges((currentEdges) =>
                currentEdges.map((edge) =>
                    edge.id === id
                        ? {
                              ...edge,
                              data: {
                                  ...(edge.data || {}),
                                  controlPoints: nextPoints,
                              },
                          }
                        : edge
                )
            );
        },
        [data, id, setEdges, sourceX, sourceY, targetX, targetY]
    );

    return (
        <>
            <AutoSmartTransitionEdge {...props} />

            {selected && (
                <EdgeLabelRenderer>
                    <button
                        type="button"
                        className="nodrag nopan"
                        title="Add control point"
                        onClick={addInitialControlPoint}
                        style={{
                            position: "absolute",
                            transform:
                                `translate(-50%, -50%) ` +
                                `translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
                            width: ADD_POINT_SIZE,
                            height: ADD_POINT_SIZE,
                            padding: 0,
                            borderRadius: "999px",
                            border: "1px solid #64748b",
                            background: "#111827",
                            color: "#e2e8f0",
                            fontSize: 14,
                            lineHeight: 1,
                            cursor: "pointer",
                            pointerEvents: "all",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 1001,
                        }}
                    >
                        +
                    </button>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

export default function EditableTransitionEdge(props) {
    const hasManualControlPoints =
        Array.isArray(props.data?.controlPoints) &&
        props.data.controlPoints.length > 0;

    return hasManualControlPoints ? (
        <ManualEditableTransitionEdge {...props} />
    ) : (
        <AutoEditableTransitionEdge {...props} />
    );
}

