import { useEffect, useMemo } from "react";
import {
    Handle,
    Position,
    useEdges,
    useUpdateNodeInternals,
} from "@xyflow/react";
import { FiAlertCircle } from "react-icons/fi";
import StateActionBadges from "./StateActionBadges";

const normalizeSlotType = (type) =>
    String(type || "").trim().toLowerCase();

const getSlotHandleDragClass = ({
                                    drag,
                                    nodeId,
                                    handleId,
                                    access,
                                    origin,
                                    slotType,
                                }) => {
    if (!drag?.active) return "";

    const isActiveHandle =
        drag.nodeId === nodeId && drag.handleId === handleId;

    if (isActiveHandle) {
        return "slot-handle-compatible slot-handle-active";
    }

    const isDestinationSide = drag.origin !== origin;
    const accessMatches = drag.access === access;
    const typeMatches =
        Boolean(drag.slotType) &&
        normalizeSlotType(slotType) === drag.slotType;

    return isDestinationSide && accessMatches && typeMatches
        ? "slot-handle-compatible"
        : "slot-handle-incompatible";
};

const getParameterValue = (parameter) => {
    if (parameter?.expr === undefined || parameter?.expr === null) {
        return "";
    }

    return String(parameter.expr).trim();
};

const getParameterDefaultValue = (parameter) => {
    if (parameter?.default === undefined || parameter?.default === null) {
        return "";
    }

    return String(parameter.default).trim();
};

function CustomNode({ id, data, selected }) {
    const edges = useEdges();
    const updateNodeInternals = useUpdateNodeInternals();

    const instanceId =
        data.fullSkillName && data.fullSkillName.includes("#")
            ? `#${data.fullSkillName.split("#")[1]}`
            : "";

    const baseStateName = String(
        data.fullSkillName || data.label || ""
    )
        .split("#")[0]
        .split(".")
        .pop()
        .toLowerCase();

    const isFinalState =
        Boolean(data.isFinal) ||
        baseStateName === "end" ||
        baseStateName === "fatal";

    const isBehaviorExit = Boolean(data.isBehaviorExit);

    // "event"    -> transitions only
    // "slots"    -> slots only
    // "overview" -> transitions, slots and parameters
    const mode = data.mode || "overview";
    const showEvents = mode === "event" || mode === "overview";
    const showSlots = mode === "slots" || mode === "overview";
    const showParameters = mode === "overview";

    const slotEntries = useMemo(
        () => [
            ...(data.inSlots || []).map((slot, index) => ({
                key: slot.key,
                type: slot.type,
                inherited: Boolean(
                    slot.inherited &&
                    (String(slot.path || "").trim() ||
                        String(slot.inherited?.xpath || "").trim())
                ),
                access: "read",
                index,
                handleId: `slot-skill-read-${index}`,
            })),
            ...(data.outSlots || []).map((slot, index) => ({
                key: slot.key,
                type: slot.type,
                inherited: Boolean(
                    slot.inherited &&
                    (String(slot.path || "").trim() ||
                        String(slot.inherited?.xpath || "").trim())
                ),
                access: "write",
                index,
                handleId: `slot-skill-write-${index}`,
            })),
        ].filter((entry) => String(entry.key || "").trim()),
        [data.inSlots, data.outSlots]
    );

    const eventIds = useMemo(
        () => [
            ...new Set(
                (data.events || [])
                    .map((event) => event.id)
                    .filter(Boolean)
            ),
        ],
        [data.events]
    );

    const parameterEntries = useMemo(
        () =>
            (data.params || [])
                .filter((parameter) => String(parameter?.key || "").trim())
                .map((parameter) => {
                    const value = getParameterValue(parameter);
                    const defaultValue = getParameterDefaultValue(parameter);

                    return {
                        key: String(parameter.key),
                        value,
                        defaultValue,
                        displayValue: value || defaultValue,
                        usesDefault: value === "" && defaultValue !== "",
                    };
                }),
        [data.params]
    );

    const overviewWidth = useMemo(() => {
        let requiredWidth = 0;

        if (showParameters && parameterEntries.length > 0) {
            const longestRow = parameterEntries.reduce((longest, parameter) => {
                const text = parameter.displayValue
                    ? `${parameter.key} = ${parameter.displayValue}`
                    : parameter.key;
                return Math.max(longest, text.length);
            }, String(data.label || "").length);

            // Grow for long names/values, but cap the node so very large string
            // parameters wrap instead of producing an enormous workflow node.
            requiredWidth = Math.max(
                requiredWidth,
                Math.min(520, Math.max(190, 55 + longestRow * 7))
            );
        }

        if (showSlots && slotEntries.length > 0) {
            const slotGutters = 16 + 24;
            const minimumPortWidth = 25;

            // Three or more slots use the compact slanted layout, so only the
            // minimum connection-point spacing is required. One/two slots keep
            // horizontal labels; reserve enough real width for those labels so
            // they cannot overlap while the ports still distribute evenly.
            const requiredSlotWidth =
                slotEntries.length <= 2
                    ? slotGutters +
                    slotEntries.reduce((total, entry) => {
                        const estimatedLabelWidth = Math.min(
                            92,
                            Math.max(
                                minimumPortWidth,
                                12 + String(entry.key || "").length * 6.5
                            )
                        );
                        return total + estimatedLabelWidth;
                    }, 0) +
                    Math.max(0, slotEntries.length - 1) * 12
                    : slotGutters + slotEntries.length * minimumPortWidth;

            requiredWidth = Math.max(
                requiredWidth,
                Math.min(520, Math.max(180, requiredSlotWidth))
            );
        }

        return requiredWidth || undefined;
    }, [
        data.label,
        parameterEntries,
        showParameters,
        showSlots,
        slotEntries,
    ]);

    const handleSignature = useMemo(
        () =>
            [
                mode,
                ...eventIds,
                ...slotEntries.map((entry) => entry.handleId),
                ...parameterEntries.map(
                    (parameter) =>
                        `${parameter.key}=${parameter.value}|default=${parameter.defaultValue}`
                ),
                overviewWidth || "auto",
            ].join("|"),
        [
            mode,
            eventIds,
            slotEntries,
            parameterEntries,
            overviewWidth,
        ]
    );

    useEffect(() => {
        requestAnimationFrame(() => updateNodeInternals(id));
    }, [id, handleSignature, updateNodeInternals]);

    const validation = useMemo(() => {
        const allSlots = [
            ...(data.inSlots || []),
            ...(data.outSlots || []),
        ];

        const missingSlots = allSlots.some(
            (slot) => !slot.path || String(slot.path).trim() === ""
        );

        const missingParams = (data.params || []).some((param) => {
            if (!param.required) return false;

            const value = getParameterValue(param);
            const defaultValue =
                param.default !== undefined && param.default !== null
                    ? String(param.default).trim()
                    : "";

            return value === "" && defaultValue === "";
        });

        const outgoingHandles = new Set(
            edges
                .filter((edge) => edge.source === id)
                .map((edge) => edge.sourceHandle)
        );

        const hasWildcard = outgoingHandles.has("*");
        let missingTransitions = false;

        if (
            showEvents &&
            !isFinalState &&
            !isBehaviorExit &&
            !hasWildcard
        ) {
            const specificEvents = (data.events || []).filter(
                (event) => event.id !== "*"
            );

            missingTransitions = specificEvents.some(
                (event) => !outgoingHandles.has(event.id)
            );
        }

        const hasMissingSlots = showSlots ? missingSlots : false;
        const hasError =
            hasMissingSlots || missingParams || missingTransitions;

        const reasons = [];
        if (hasMissingSlots) reasons.push("Not every slot has a path");
        if (missingParams) reasons.push("Required parameters are missing");
        if (missingTransitions) reasons.push("Not every transition is set");

        return {
            hasError,
            tooltip: reasons.join("\n"),
        };
    }, [
        data,
        edges,
        id,
        showEvents,
        showSlots,
        isFinalState,
        isBehaviorExit,
    ]);

    return (
        <div
            className={`costum-node ${
                data.isInitial ? "initial-node" : ""
            } ${selected ? "selected-node" : ""} ${
                isFinalState ? "terminal-final-node" : ""
            } ${isBehaviorExit ? "behavior-exit-node" : ""} ${
                showSlots && slotEntries.length > 0 ? "has-slot-dock" : ""
            } mode-${mode}`}
            style={
                overviewWidth
                    ? {
                        width: `${overviewWidth}px`,
                        maxWidth: "520px",
                    }
                    : undefined
            }
        >
            <StateActionBadges
                onEntry={data.onEntry}
                onExit={data.onExit}
                onEntryClick={() => data.onOpenStateActions?.(id)}
                onExitClick={() => data.onOpenStateActions?.(id)}
            />

            {validation.hasError && (
                <div
                    className="node-warning-badge"
                    title={validation.tooltip}
                >
                    <FiAlertCircle />
                </div>
            )}

            {showEvents && (
                <Handle
                    id="transition-target"
                    type="target"
                    position={Position.Left}
                    className="target-handle"
                    isConnectableStart={false}
                    isConnectableEnd={true}
                />
            )}

            <div className="custom-node-label">
                {data.label}

                {instanceId && !isBehaviorExit && (
                    <span
                        style={{
                            marginLeft: "4px",
                            color: "#64748b",
                            fontWeight: 600,
                        }}
                    >
                        {instanceId}
                    </span>
                )}
            </div>

            {showEvents &&
                !isFinalState &&
                !isBehaviorExit &&
                eventIds.length > 0 && (
                    <div className="event-list">
                        {eventIds.map((eventId) => (
                            <div className="event-row" key={eventId}>
                                <span className="event-name">{eventId}</span>

                                <Handle
                                    id={eventId}
                                    type="source"
                                    position={Position.Right}
                                    className="source-handle"
                                    isConnectableStart={true}
                                    isConnectableEnd={false}
                                />
                            </div>
                        ))}
                    </div>
                )}

            {showParameters && parameterEntries.length > 0 && (
                <>
                    {showEvents &&
                        !isFinalState &&
                        !isBehaviorExit &&
                        eventIds.length > 0 && (
                            <div className="node-slot-divider" />
                        )}

                    <div
                        className="node-parameter-summary"
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            padding: "6px 10px 4px",
                        }}
                    >
                        {parameterEntries.map((parameter) => (
                            <div
                                key={parameter.key}
                                className="node-parameter-row"
                                title={
                                    parameter.displayValue
                                        ? `${parameter.key} = ${parameter.displayValue}${
                                            parameter.usesDefault
                                                ? " (default)"
                                                : ""
                                        }`
                                        : parameter.key
                                }
                                style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: "6px",
                                    minWidth: 0,
                                    fontSize: "10px",
                                    lineHeight: 1.35,
                                }}
                            >
                                <span
                                    className="node-parameter-key"
                                    style={{
                                        fontWeight: 700,
                                        color: "#475569",
                                        overflowWrap: "anywhere",
                                    }}
                                >
                                    {parameter.key}
                                </span>

                                {parameter.displayValue && (
                                    <>
                                        <span
                                            aria-hidden="true"
                                            style={{ color: "#94a3b8" }}
                                        >
                                            =
                                        </span>
                                        <span
                                            className={`node-parameter-value ${
                                                parameter.usesDefault
                                                    ? "node-parameter-default-value"
                                                    : ""
                                            }`}
                                            style={{
                                                color: parameter.usesDefault
                                                    ? "#94a3b8"
                                                    : "#0f172a",
                                                fontFamily:
                                                    "Consolas, Monaco, 'Courier New', monospace",
                                                fontStyle: parameter.usesDefault
                                                    ? "italic"
                                                    : "normal",
                                                overflowWrap: "anywhere",
                                                minWidth: 0,
                                            }}
                                        >
                                            {parameter.displayValue}
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {showSlots && slotEntries.length > 0 && (
                <>
                    {((showEvents &&
                            !isFinalState &&
                            !isBehaviorExit &&
                            eventIds.length > 0) ||
                        (showParameters && parameterEntries.length > 0)) && (
                        <div className="node-slot-divider" />
                    )}

                    <div className="skill-slot-access-guide" aria-hidden="true">
                        <div className="skill-slot-access skill-slot-access-write">
                            <span className="skill-slot-access-dot" />
                            <span>Write</span>
                        </div>
                        <div className="skill-slot-access skill-slot-access-read">
                            <span className="skill-slot-access-dot" />
                            <span>Read</span>
                        </div>
                    </div>

                    <div
                        className={`node-slot-summary ${
                            slotEntries.length >= 3
                                ? "node-slot-summary-slanted"
                                : "node-slot-summary-horizontal"
                        }`}
                    >
                        <div className="skill-slot-border-rail" aria-hidden="true">
                            {slotEntries.map((entry) => (
                                <span
                                    key={`rail-${entry.access}-${entry.index}-${entry.key}`}
                                    className={`skill-slot-border-segment skill-slot-border-segment-${entry.access}`}
                                />
                            ))}
                        </div>

                        <div className="node-slot-ports">
                            {slotEntries.map((entry) => {
                                const dragClass = getSlotHandleDragClass({
                                    drag: data.slotConnectionDrag,
                                    nodeId: id,
                                    handleId: entry.handleId,
                                    access: entry.access,
                                    origin: "skill",
                                    slotType: entry.type,
                                });

                                return (
                                    <div
                                        key={`${entry.access}-${entry.index}-${entry.key}`}
                                        className={`node-slot-row node-slot-row-${entry.access}`}
                                    >
                                        <span
                                            className={`node-slot-entry ${
                                                entry.inherited
                                                    ? "node-slot-entry-inherited"
                                                    : ""
                                            }`}
                                            title={`${
                                                entry.access === "read"
                                                    ? "Read"
                                                    : "Write"
                                            } slot ${entry.key}`}
                                        >
                                            <span className="node-slot-key">
                                                {entry.key}
                                            </span>
                                        </span>

                                        <Handle
                                            id={entry.handleId}
                                            type="source"
                                            position={Position.Bottom}
                                            className={`source-handle skill-slot-handle slot-skill-${entry.access}-handle ${dragClass}`}
                                            title={`${
                                                entry.access === "read"
                                                    ? "Read"
                                                    : "Write"
                                            } ${entry.key}`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default CustomNode;
