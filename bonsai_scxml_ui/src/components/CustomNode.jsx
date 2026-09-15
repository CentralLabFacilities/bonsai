import { useMemo } from "react";
import { Handle, Position, useEdges } from "@xyflow/react";
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
    const isCompatible =
        isDestinationSide && accessMatches && typeMatches;

    return isCompatible
        ? "slot-handle-compatible"
        : "slot-handle-incompatible";
};

function CustomNode({ id, data, selected }) {
    const edges = useEdges();

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

    // Supported modes:
    // "event" -> show events only
    // "slots" -> show slots only
    // "both"  -> show events followed by slots
    const mode = data.mode || "both";

    const showEvents = mode === "event" || mode === "both";
    const showSlots = mode === "slots" || mode === "both";

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

            const val =
                param.expr !== undefined && param.expr !== null
                    ? String(param.expr).trim()
                    : "";

            const def =
                param.default !== undefined && param.default !== null
                    ? String(param.default).trim()
                    : "";

            return val === "" && def === "";
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

        if (hasMissingSlots) {
            reasons.push("Not every slot has a path");
        }

        if (missingParams) {
            reasons.push("Required parameters are missing");
        }

        if (missingTransitions) {
            reasons.push("Not every transition is set");
        }

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

    // Keep every slot as its own row. A slot is either read or write, so each
    // row gets exactly one connection point on the right side of the skill.
    const slotEntries = useMemo(
        () => [
            ...(data.inSlots || []).map((slot, index) => ({
                key: slot.key,
                type: slot.type,
                inherited: Boolean(slot.inherited),
                access: "read",
                index,
                handleId: `slot-skill-read-${index}`,
            })),
            ...(data.outSlots || []).map((slot, index) => ({
                key: slot.key,
                type: slot.type,
                inherited: Boolean(slot.inherited),
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

    return (
        <div
            className={`costum-node ${
                data.isInitial ? "initial-node" : ""
            } ${selected ? "selected-node" : ""} ${
                isFinalState ? "terminal-final-node" : ""
            } ${isBehaviorExit ? "behavior-exit-node" : ""} mode-${mode}`}
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

            {/* Transition input is only visible when transitions are shown. */}
            {showEvents && (
                <Handle
                    id="transition-target"
                    type="target"
                    position={Position.Left}
                    className="target-handle"
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

            {/* Event outputs */}
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
                                />
                            </div>
                        ))}
                    </div>
                )}

            {/* Slot keys */}
            {showSlots && slotEntries.length > 0 && (
                <>
                    {showEvents &&
                        !isFinalState &&
                        !isBehaviorExit &&
                        eventIds.length > 0 && (
                            <div className="node-slot-divider" />
                        )}

                    <div className="node-slot-summary">
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
                                        <span className={`node-slot-access node-slot-access-${entry.access}`}>
                                            {entry.access === "read" ? "Read" : "Write"}
                                        </span>
                                        <span className="node-slot-key">{entry.key}</span>
                                    </span>

                                    <Handle
                                        id={entry.handleId}
                                        type="source"
                                        position={Position.Right}
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
                </>
            )}
        </div>
    );
}

export default CustomNode;
