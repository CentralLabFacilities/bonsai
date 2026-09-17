import { useEffect, useMemo } from "react";
import {
    Handle,
    Position,
    useUpdateNodeInternals,
} from "@xyflow/react";
import { FiExternalLink } from "react-icons/fi";
import StateActionBadges from "./StateActionBadges";

const normalizeSlotType = (type) =>
    String(type || "").trim().toLowerCase();

const getSlotHandleDragClass = ({
                                    drag,
                                    nodeId,
                                    handleId,
                                    access,
                                    slotType,
                                }) => {
    if (!drag?.active) return "";

    const isActiveHandle =
        drag.nodeId === nodeId && drag.handleId === handleId;

    if (isActiveHandle) {
        return "slot-handle-compatible slot-handle-active";
    }

    const isDestinationSide = drag.origin !== "submachine";
    const accessMatches = drag.access === access;
    const typeMatches =
        Boolean(drag.slotType) &&
        normalizeSlotType(slotType) === drag.slotType;

    return isDestinationSide && accessMatches && typeMatches
        ? "slot-handle-compatible"
        : "slot-handle-incompatible";
};

const formatDataModelValue = (entry) => {
    if (entry?.expr === undefined || entry?.expr === null) {
        return "";
    }

    return String(entry.expr).trim();
};

export default function SubMachineNode({ id, data, selected }) {
    const updateNodeInternals = useUpdateNodeInternals();

    // "event"    -> transitions only
    // "slots"    -> slots only
    // "overview" -> local datamodel, transitions and slots
    const mode = data.mode || "overview";
    const showEvents = mode === "event" || mode === "overview";
    const showSlots = mode === "slots" || mode === "overview";
    const showLocalDataModel = mode === "overview";

    const eventIds = useMemo(
        () => [
            ...new Set(
                (data.events || [])
                    .map((event) => String(event?.id || "").trim())
                    .filter(Boolean)
            ),
        ],
        [data.events]
    );

    const localDataModelEntries = useMemo(
        () =>
            (data.localDataModel || [])
                .filter((entry) => String(entry?.id || "").trim())
                .map((entry) => ({
                    id: String(entry.id).trim(),
                    expr: formatDataModelValue(entry),
                })),
        [data.localDataModel]
    );

    const slotEntries = useMemo(() => {
        const regularSlots = [
            ...(data.inSlots || []).map((slot, index) => ({
                key: slot.key,
                path: slot.path,
                type: slot.type,
                access: "read",
                handleId: `slot-skill-read-${index}`,
                inherited: Boolean(slot.inherited),
            })),
            ...(data.outSlots || []).map((slot, index) => ({
                key: slot.key,
                path: slot.path,
                type: slot.type,
                access: "write",
                handleId: `slot-skill-write-${index}`,
                inherited: Boolean(slot.inherited),
            })),
        ];

        const inheritedSlots = (data.inheritedSlots || [])
            .map((slot, index) => ({
                key: slot.key,
                path: slot.path,
                type: slot.type,
                access: slot.access,
                handleId:
                    slot.access === "read" || slot.access === "write"
                        ? `slot-submachine-${slot.access}-${index}`
                        : null,
                inherited: true,
            }))
            .filter(
                (slot) =>
                    slot.handleId &&
                    (slot.access === "read" || slot.access === "write")
            );

        return [...regularSlots, ...inheritedSlots].filter(
            (entry) =>
                String(entry.key || entry.path || "").trim()
        );
    }, [data.inSlots, data.outSlots, data.inheritedSlots]);

    const overviewWidth = useMemo(() => {
        if (!showLocalDataModel || localDataModelEntries.length === 0) {
            return undefined;
        }

        const longestRow = localDataModelEntries.reduce((longest, entry) => {
            const text = entry.expr
                ? `${entry.id} = ${entry.expr}`
                : entry.id;

            return Math.max(longest, text.length);
        }, String(data.label || "").length);

        return Math.min(520, Math.max(190, 55 + longestRow * 7));
    }, [data.label, localDataModelEntries, showLocalDataModel]);

    const handleSignature = useMemo(
        () =>
            [
                mode,
                ...eventIds,
                ...slotEntries.map((entry) => entry.handleId),
                ...localDataModelEntries.map(
                    (entry) => `${entry.id}=${entry.expr}`
                ),
                overviewWidth || "auto",
            ].join("|"),
        [
            mode,
            eventIds,
            slotEntries,
            localDataModelEntries,
            overviewWidth,
        ]
    );

    useEffect(() => {
        requestAnimationFrame(() => {
            updateNodeInternals(id);
        });
    }, [id, handleSignature, updateNodeInternals]);

    const hasEvents = showEvents && eventIds.length > 0;
    const hasSlots = showSlots && slotEntries.length > 0;

    return (
        <div
            className={`submachine-node ${
                data.isInitial ? "initial-node" : ""
            } ${selected ? "selected-node" : ""} mode-${mode}`}
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

            {showEvents && (
                <Handle
                    id="transition-target"
                    type="target"
                    position={Position.Left}
                    className="target-handle"
                />
            )}

            <div className="submachine-header">
                <span className="submachine-badge">
                    Sub-State-Machine
                </span>

                <button
                    type="button"
                    className="open-sub-tab-button nodrag nopan"
                    title="Open sub-state machine"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        data.onOpenSubMachine?.(data.src, data.label);
                    }}
                >
                    <FiExternalLink />
                </button>
            </div>

            <div className="custom-node-label">
                {data.label || id}
            </div>

            {showLocalDataModel && localDataModelEntries.length > 0 && (
                <>
                    <div
                        className="submachine-datamodel-summary"
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            padding: "0 10px 6px",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "9px",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                letterSpacing: "0.45px",
                                color: "#7e22ce",
                                marginBottom: "1px",
                            }}
                        >
                            Local Datamodel
                        </div>

                        {localDataModelEntries.map((entry) => (
                            <div
                                key={entry.id}
                                title={
                                    entry.expr
                                        ? `${entry.id} = ${entry.expr}`
                                        : entry.id
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
                                    style={{
                                        fontWeight: 700,
                                        color: "#6b21a8",
                                        overflowWrap: "anywhere",
                                    }}
                                >
                                    {entry.id}
                                </span>

                                {entry.expr && (
                                    <>
                                        <span
                                            aria-hidden="true"
                                            style={{ color: "#a78bfa" }}
                                        >
                                            =
                                        </span>
                                        <span
                                            style={{
                                                color: "#3b0764",
                                                fontFamily:
                                                    "Consolas, Monaco, 'Courier New', monospace",
                                                overflowWrap: "anywhere",
                                                minWidth: 0,
                                            }}
                                        >
                                            {entry.expr}
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {(hasEvents || hasSlots) && (
                        <div className="node-slot-divider" />
                    )}
                </>
            )}

            {hasEvents && (
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

            {hasSlots && (
                <>
                    {hasEvents && <div className="node-slot-divider" />}

                    <div className="node-slot-summary">
                        {slotEntries.map((entry) => {
                            const dragClass = getSlotHandleDragClass({
                                drag: data.slotConnectionDrag,
                                nodeId: id,
                                handleId: entry.handleId,
                                access: entry.access,
                                slotType: entry.type,
                            });

                            const label = String(
                                entry.key || entry.path || "Slot"
                            );

                            return (
                                <div
                                    key={`${entry.handleId}-${label}`}
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
                                        } slot ${label}`}
                                    >
                                        <span
                                            className={`node-slot-access node-slot-access-${entry.access}`}
                                        >
                                            {entry.access === "read"
                                                ? "Read"
                                                : "Write"}
                                        </span>
                                        <span className="node-slot-key">
                                            {label}
                                        </span>
                                    </span>

                                    <Handle
                                        id={entry.handleId}
                                        type="source"
                                        position={Position.Right}
                                        className={`source-handle skill-slot-handle slot-skill-${entry.access}-handle ${dragClass}`}
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
