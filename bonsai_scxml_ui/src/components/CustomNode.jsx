import { useMemo } from "react";
import { Handle, Position, useEdges } from "@xyflow/react";
import { FiAlertCircle } from "react-icons/fi";
import StateActionBadges from "./StateActionBadges";

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
    // "both"  -> show events and slots
    const mode = data.mode || "both";

    const showEvents = mode === "event" || mode === "both";
    const showSlots = mode === "slots" || mode === "both";

    const validation = useMemo(() => {
        const allSlots = [
            ...(data.inSlots || []),
            ...(data.outSlots || []),
        ];

        const missingSlots = allSlots.some(
            (slot) =>
                !slot.path ||
                String(slot.path).trim() === ""
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

        // Final states and outward behavior exits terminate the local behavior,
        // so they do not need outgoing transitions.
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

        // Slot validation only matters when slots are visible.
        const hasMissingSlots = showSlots ? missingSlots : false;

        const hasError =
            hasMissingSlots ||
            missingParams ||
            missingTransitions;

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

    const slotSummary = useMemo(() => {
        const seen = new Set();

        return [
            ...(data.inSlots || []),
            ...(data.outSlots || []),
        ]
            .filter((slot) => {
                const key = String(slot.key || "").trim();

                if (!key || seen.has(key)) {
                    return false;
                }

                seen.add(key);
                return true;
            })
            .map((slot) => ({
                key: slot.key,
                inherited: Boolean(slot.inherited),
            }));
    }, [data.inSlots, data.outSlots]);

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
            } ${
                isBehaviorExit ? "behavior-exit-node" : ""
            } mode-${mode}`}
        >
            <StateActionBadges
                onEntry={data.onEntry}
                onExit={data.onExit}
                onEntryClick={() =>
                    data.onOpenStateActions?.(id)
                }
                onExitClick={() =>
                    data.onOpenStateActions?.(id)
                }
            />

            {validation.hasError && (
                <div
                    className="node-warning-badge"
                    title={validation.tooltip}
                >
                    <FiAlertCircle />
                </div>
            )}

            {/* Incoming transitions remain possible for all nodes,
                including End/Fatal and behavior exits. */}
            <Handle
                type="target"
                position={Position.Left}
                className="target-handle"
            />

            {showSlots && (
                <>
                    {(data.outSlots || []).map(
                        (slot, index) => (
                            <Handle
                                key={
                                    slot.key ||
                                    `out-${index}`
                                }
                                id={`write-source-${index}`}
                                type="source"
                                position={Position.Bottom}
                                className="slot-write-handle"
                                style={{
                                    left: `${
                                        10 + index * 40
                                    }%`,
                                }}
                            />
                        )
                    )}

                    {(data.inSlots || []).map(
                        (slot, index) => (
                            <Handle
                                key={
                                    slot.key ||
                                    `in-${index}`
                                }
                                id={`read-target-${index}`}
                                type="target"
                                position={Position.Top}
                                className="slot-read-handle"
                                style={{
                                    left: `${
                                        10 + index * 40
                                    }%`,
                                }}
                            />
                        )
                    )}
                </>
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
                            <div
                                className="event-row"
                                key={eventId}
                            >
                                <span className="event-name">
                                    {eventId}
                                </span>

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

            {showSlots && slotSummary.length > 0 && (
                <>
                    {showEvents &&
                        !isFinalState &&
                        !isBehaviorExit &&
                        eventIds.length > 0 && (
                            <div className="node-slot-divider" />
                        )}

                    <div className="node-slot-summary">
                        {slotSummary.map((entry) => (
                            <span
                                key={entry.key}
                                className={`node-slot-chip ${
                                    entry.inherited
                                        ? "node-slot-chip-inherited"
                                        : ""
                                }`}
                                title={`Slot${
                                    entry.inherited
                                        ? " (inherited)"
                                        : ""
                                }`}
                            >
                                {entry.key}
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default CustomNode;
